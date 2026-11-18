"""Transient solutions, hitting probabilities and occupation of the embedded chain."""

import networkx as nx
import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import expm

from markov_lab.domain.models import AnalysisResult, AnalysisSettings, StateMetric, TimePoint
from markov_lab.engine.build import TERMINALS, Array, Chain, ModelError

MASS_TOL = 5e-8
MAX_RATE_TIME = 5000
ODE_TOL = 2e-7


def check_horizon(chain: Chain, horizon: float) -> None:
    if chain.kind == "ctmc" and float(np.max(-np.diag(chain.matrix))) * horizon > MAX_RATE_TIME:
        raise ModelError("Добуток максимальної інтенсивності виходу на час має бути ≤ 5000.")


def evolve(chain: Chain, matrix: Array, time: float) -> Array:
    if time == 0:
        return chain.initial.copy()
    kernel = (
        np.linalg.matrix_power(matrix, int(time)) if chain.kind == "dtmc" else expm(matrix * time)
    )
    row: Array = chain.initial @ kernel
    if not np.isfinite(row).all() or np.min(row) < -MASS_TOL or abs(row.sum() - 1) > MASS_TOL:
        raise ModelError("Чисельний метод не зберіг імовірнісну масу в межах допуску.")
    row = np.clip(row, 0, 1)
    return row / row.sum()


def hitting_matrix(chain: Chain, index: int) -> Array:
    matrix = chain.matrix.copy()
    matrix[index] = 0
    if chain.kind == "dtmc":
        matrix[index, index] = 1
    return matrix


def expected_visits(chain: Chain) -> list[float | None]:
    """Visits up to absorption, including time zero and repeat calls in generated chains."""
    count = len(chain.states) - TERMINALS
    graph: nx.DiGraph = nx.from_numpy_array(chain.embedded, create_using=nx.DiGraph)
    reachable: set[int] = set()
    for origin in np.flatnonzero(chain.initial > 0):
        reachable.add(int(origin))
        reachable.update(nx.descendants(graph, int(origin)))
    recurrent = {
        index
        for component in nx.attracting_components(graph.subgraph(reachable))
        for index in component
        if index < count and chain.embedded[index].sum() > 0
    }
    result: list[float | None] = [None if i in recurrent else 0.0 for i in range(count)]
    transient = sorted({i for i in reachable if i < count} - recurrent)
    if transient:
        block = chain.embedded[np.ix_(transient, transient)]
        equation = np.eye(len(transient)) - block.T
        if np.linalg.cond(equation) > 1e14:
            for index in transient:
                result[index] = None
        else:
            visits = np.linalg.solve(equation, chain.initial[transient])
            for index, value in zip(transient, visits, strict=True):
                result[index] = max(0.0, float(value))
    return result


def analyze(chain: Chain, settings: AnalysisSettings) -> AnalysisResult:
    check_horizon(chain, settings.horizon)
    target = None
    if settings.target is not None:
        if settings.target not in chain.states:
            raise ModelError("Обраного стану першого проходу немає в моделі.")
        target = chain.states.index(settings.target)
    times = np.linspace(0, settings.horizon, settings.points)
    if chain.kind == "dtmc":
        times = np.rint(times)
    times = np.unique(times)
    rows = np.stack([evolve(chain, chain.matrix, t) for t in times])
    ode_error = None
    if chain.kind == "ctmc":
        ode_error = 0.0
        if settings.horizon:

            def derivative(_time: float, row: Array) -> Array:
                return chain.matrix.T @ row

            ode = solve_ivp(
                derivative,
                (0, settings.horizon),
                chain.initial,
                t_eval=times,
                method="DOP853",
                rtol=2e-9,
                atol=2e-11,
            )
            if not ode.success or ode.y.T.shape != rows.shape:
                raise ModelError("Інтегратор рівнянь Колмогорова не завершив обчислення.")
            ode_error = float(np.max(np.abs(rows - ode.y.T)))
            if not np.isfinite(ode_error) or ode_error > ODE_TOL:
                raise ModelError("Розв’язки expm та рівнянь Колмогорова розходяться понад допуск.")

    altered = None if target is None else hitting_matrix(chain, target)
    series = []
    for time, row in zip(times, rows, strict=True):
        passage = (
            None
            if altered is None or target is None
            else float(evolve(chain, altered, time)[target])
        )
        series.append(
            TimePoint(
                time=time,
                distribution=row.tolist(),
                reliability=1 - row[-1],
                success=row[-2],
                failure=row[-1],
                running=row[:-TERMINALS].sum(),
                first_passage=passage,
            )
        )

    visits = expected_visits(chain)
    metrics = [
        StateMetric(
            id=state,
            name=chain.names[i],
            initial=chain.initial[i],
            first_hit=evolve(chain, hitting_matrix(chain, i), settings.horizon)[i],
            expected_visits=visits[i] if i < len(visits) else None,
        )
        for i, state in enumerate(chain.states)
    ]
    return AnalysisResult(
        **chain.describe().model_dump(),
        series=series,
        metrics=metrics,
        ode_error=ode_error,
        target=settings.target,
    )
