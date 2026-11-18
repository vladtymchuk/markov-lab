import math

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from markov_lab.domain.models import AnalysisSettings, SimulationSettings, SoftwareSystem, Task
from markov_lab.engine.analysis import analyze
from markov_lab.engine.build import ModelError, compile_chain
from markov_lab.engine.experiments import sensitivity, simulate


def one_module(reliability: float = 0.9, rate: float = 2) -> SoftwareSystem:
    return SoftwareSystem.model_validate(
        {
            "modules": [{"id": "a", "name": "A", "reliability": reliability, "rate": rate}],
            "transitions": [{"source": "a", "target": "SUCCESS", "probability": 1}],
        }
    )


def test_discrete_and_continuous_known_results() -> None:
    system = one_module()
    discrete = analyze(compile_chain(system, "dtmc"), AnalysisSettings(horizon=1, target="FAILURE"))
    np.testing.assert_allclose(discrete.matrix, [[0, 0.9, 0.1], [0, 1, 0], [0, 0, 1]])
    np.testing.assert_allclose(discrete.series[0].distribution, [1, 0, 0])
    assert discrete.series[0].success == 0
    assert discrete.series[0].reliability == 1
    assert discrete.series[-1].first_passage == pytest.approx(0.1)
    assert discrete.metrics[0].expected_visits == 1
    continuous = analyze(
        compile_chain(system, "ctmc"), AnalysisSettings(kind="ctmc", horizon=1, points=6)
    )
    np.testing.assert_allclose(continuous.matrix, [[-2, 1.8, 0.2], [0, 0, 0], [0, 0, 0]])
    np.testing.assert_allclose(continuous.series[0].distribution, [1, 0, 0])
    assert continuous.ode_error is not None and continuous.ode_error < 1e-8
    assert continuous.series[-1].running == pytest.approx(math.exp(-2))
    assert continuous.series[-1].success == pytest.approx(0.9 * (1 - math.exp(-2)))


def test_task_weights_and_first_hit() -> None:
    payload = one_module().model_dump()
    payload["modules"].append({"id": "b", "name": "B"})
    payload["tasks"] = [
        {"id": "x", "name": "X", "weight": 1},
        {"id": "y", "name": "Y", "weight": 2},
    ]
    payload["assignments"] = [
        {"module_id": "a", "task_id": "x", "weight": 3},
        {"module_id": "b", "task_id": "x", "weight": 1},
        {"module_id": "b", "task_id": "y", "weight": 1},
    ]
    payload["transitions"] += [{"source": "b", "target": "a", "probability": 1}]
    result = analyze(
        compile_chain(SoftwareSystem.model_validate(payload), "dtmc"),
        AnalysisSettings(horizon=2, target="a"),
    )
    assert result.initial == pytest.approx([0.25, 0.75, 0, 0])
    assert result.metrics[0].first_hit == pytest.approx(0.25 + 0.75 * 0.99)
    assert result.series[-1].distribution[0] == 0


def test_bad_routes_generator_and_absorption() -> None:
    system = one_module().model_copy(update={"transitions": []})
    with pytest.raises(ModelError, match="маршрутизація"):
        compile_chain(system, "dtmc")
    system.manual_p = [[1, 0, 0], [1, 0, 0], [0, 0, 1]]
    with pytest.raises(ModelError, match="поглинаючими"):
        compile_chain(system, "dtmc")
    system.manual_q = [[-2, 1, 0], [0, 0, 0], [0, 0, 0]]
    with pytest.raises(ModelError, match="Діагональ"):
        compile_chain(system, "ctmc")
    system.manual_q[0] = [0, 0, 0]
    result = analyze(compile_chain(system, "ctmc"), AnalysisSettings(kind="ctmc"))
    assert result.metrics[0].expected_visits == 1
    assert result.series[-1].running == 1


def test_self_calls_and_closed_class() -> None:
    payload = one_module().model_dump()
    payload["transitions"] = [{"source": "a", "target": "a", "probability": 1}]
    system = SoftwareSystem.model_validate(payload)
    result = analyze(compile_chain(system, "ctmc"), AnalysisSettings(kind="ctmc", horizon=3))
    assert result.metrics[0].expected_visits == pytest.approx(10)
    assert result.series[-1].reliability == pytest.approx(math.exp(-0.6))
    system.modules[0].reliability = 1
    result = analyze(compile_chain(system, "dtmc"), AnalysisSettings())
    assert result.metrics[0].expected_visits is None
    assert result.series[-1].success == 0
    assert any("Замкнений" in item for item in result.warnings)


@given(
    r=st.floats(min_value=0, max_value=1),
    rate=st.floats(min_value=0.01, max_value=20),
    time=st.integers(min_value=0, max_value=8),
)
@settings(max_examples=60, deadline=None)
def test_markov_invariants(r: float, rate: float, time: int) -> None:
    system = one_module(r, rate)
    for kind in ("dtmc", "ctmc"):
        result = analyze(
            compile_chain(system, kind), AnalysisSettings(kind=kind, horizon=time, points=5)
        )
        assert result.series[0].distribution == [1, 0, 0]
        for row in result.series:
            assert min(row.distribution) >= 0
            assert sum(row.distribution) == pytest.approx(1)
            assert row.reliability == pytest.approx(row.running + row.success)
        assert all(
            a.reliability >= b.reliability - 1e-10
            for a, b in zip(result.series, result.series[1:], strict=False)
        )


@pytest.mark.parametrize("kind", ["dtmc", "ctmc"])
def test_seeded_monte_carlo(kind: str) -> None:
    options = SimulationSettings.model_validate(
        {"kind": kind, "horizon": 1, "seed": 23, "trials": 16000}
    )
    chain = compile_chain(one_module(0.8), options.kind)
    first = simulate(chain, options)
    assert first == simulate(chain, options)
    for estimate in first.estimates:
        assert estimate.lower <= estimate.analytical <= estimate.upper


def test_sensitivity_matches_single_module_optimum() -> None:
    (item,) = sensitivity(one_module(0.8), AnalysisSettings(horizon=1), 0.1)
    assert item.gain == pytest.approx(0.1)


@given(data=st.data(), size=st.integers(min_value=2, max_value=6))
@settings(max_examples=35, deadline=None)
def test_multimodule_chain_invariants(data: st.DataObject, size: int) -> None:
    row_weights = st.lists(
        st.integers(min_value=1, max_value=30), min_size=size + 1, max_size=size + 1
    )
    modules = [
        {
            "id": f"m{index}",
            "name": f"Module {index}",
            "reliability": data.draw(st.integers(0, 100)) / 100,
            "rate": data.draw(st.integers(1, 25)) / 10,
        }
        for index in range(size)
    ]
    transitions = []
    for origin in modules:
        weights = data.draw(row_weights)
        total = sum(weights)
        for target, weight in zip([m["id"] for m in modules] + ["SUCCESS"], weights, strict=True):
            transitions.append(
                {"source": origin["id"], "target": target, "probability": weight / total}
            )
    system = SoftwareSystem.model_validate({"modules": modules, "transitions": transitions})
    discrete = compile_chain(system, "dtmc")
    continuous = compile_chain(system, "ctmc")
    np.testing.assert_allclose(discrete.matrix.sum(axis=1), np.ones(size + 2), atol=1e-12)
    np.testing.assert_allclose(continuous.matrix.sum(axis=1), np.zeros(size + 2), atol=1e-12)
    off_diagonal = continuous.matrix.copy()
    np.fill_diagonal(off_diagonal, 0)
    assert (off_diagonal >= 0).all()
    result = analyze(continuous, AnalysisSettings(kind="ctmc", horizon=3, points=7, target="m1"))
    curve = [p.first_passage for p in result.series]
    assert curve == sorted(curve)
    assert result.metrics[1].first_hit == result.series[-1].first_passage
    assert result.series[-1].distribution[1] <= result.metrics[1].first_hit + 1e-12


def test_missing_executor_rejected() -> None:
    system = one_module()
    system.tasks = [Task(id="unassigned", name="Unassigned")]
    with pytest.raises(ModelError, match="виконавця"):
        compile_chain(system, "dtmc")
