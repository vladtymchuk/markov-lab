"""Seeded path simulation and marginal reliability improvements."""

from time import monotonic

import numpy as np

from markov_lab.domain.models import (
    AnalysisSettings,
    Estimate,
    SensitivityItem,
    SimulationResult,
    SimulationSettings,
    SoftwareSystem,
)
from markov_lab.engine.analysis import check_horizon, evolve
from markov_lab.engine.build import Array, Chain, ModelError, compile_chain

MAX_PATH_EVENTS = 5_000_000


def _estimate(metric: str, count: int, total: int, analytical: float) -> Estimate:
    value = count / total
    z = 1.959963984540054
    center = (value + z**2 / (2 * total)) / (1 + z**2 / total)
    radius = z * (value * (1 - value) / total + z**2 / (4 * total**2)) ** 0.5
    radius /= 1 + z**2 / total
    return Estimate(
        metric=metric,
        analytical=analytical,
        estimate=value,
        error=value - analytical,
        lower=0 if count == 0 else max(0, center - radius),
        upper=1 if count == total else min(1, center + radius),
    )


def simulate(chain: Chain, settings: SimulationSettings) -> SimulationResult:
    check_horizon(chain, settings.horizon)
    rng = np.random.default_rng(settings.seed)
    count = len(chain.states)
    cutoff = count - 2
    states = rng.choice(count, size=settings.trials, p=chain.initial)
    clocks = np.zeros(settings.trials)
    rates = -np.diag(chain.matrix) if chain.kind == "ctmc" else np.ones(count)
    jump = chain.matrix.copy()
    if chain.kind == "ctmc":
        np.fill_diagonal(jump, 0)
        jump = np.divide(jump, rates[:, None], out=np.zeros_like(jump), where=rates[:, None] > 0)
    cdf = np.cumsum(jump, axis=1)
    cdf[:, -1] = 1
    alive = np.flatnonzero((states < cutoff) & (rates[states] > 0))
    step = 0
    events = 0
    deadline = monotonic() + 8
    while alive.size and settings.horizon > 0:
        events += int(alive.size)
        if events > MAX_PATH_EVENTS or monotonic() > deadline:
            raise ModelError("Ліміт симуляції. Зменште горизонт або кількість експериментів.")
        if chain.kind == "ctmc":
            clocks[alive] += rng.exponential(1 / rates[states[alive]])
            alive = alive[clocks[alive] <= settings.horizon]
        else:
            if step >= settings.horizon:
                break
            step += 1
        origins = states[alive]
        for origin in np.unique(origins):
            group = alive[origins == origin]
            states[group] = np.searchsorted(cdf[origin], rng.random(group.size), side="right")
        alive = alive[(states[alive] < cutoff) & (rates[states[alive]] > 0)]
    exact = evolve(chain, chain.matrix, settings.horizon)
    success = int((states == cutoff).sum())
    failure = int((states == cutoff + 1).sum())
    total = settings.trials
    return SimulationResult(
        trials=total,
        seed=settings.seed,
        estimates=[
            _estimate("reliability", total - failure, total, 1 - exact[-1]),
            _estimate("success", success, total, exact[-2]),
            _estimate("failure", failure, total, exact[-1]),
            _estimate("running", total - success - failure, total, float(exact[:-2].sum())),
        ],
    )


def sensitivity(
    system: SoftwareSystem, settings: AnalysisSettings, delta: float
) -> list[SensitivityItem]:
    if (system.manual_p if settings.kind == "dtmc" else system.manual_q) is not None:
        raise ModelError("Аналіз чутливості потребує автоматичної матриці.")
    base = compile_chain(system, settings.kind)
    check_horizon(base, settings.horizon)
    reference = float(1 - evolve(base, base.matrix, settings.horizon)[-1])
    output = []
    for index, module in enumerate(system.modules):
        after = min(1, module.reliability + delta)
        modules = system.modules.copy()
        modules[index] = module.model_copy(update={"reliability": after})
        new = compile_chain(system.model_copy(update={"modules": modules}), settings.kind)
        check_horizon(new, settings.horizon)
        row: Array = evolve(new, new.matrix, settings.horizon)
        result = float(1 - row[-1])
        output.append(
            SensitivityItem(
                id=module.id,
                name=module.name,
                before=module.reliability,
                after=after,
                reliability=result,
                gain=result - reference,
            )
        )
    return sorted(output, key=lambda item: -item.gain)
