"""Compile model input into row-oriented chains, with explicit numerical checks."""

from dataclasses import dataclass

import networkx as nx
import numpy as np
from numpy.typing import NDArray

from markov_lab.domain.models import FAILURE, SUCCESS, Kind, Matrices, SoftwareSystem

Array = NDArray[np.float64]
TOL = 1e-10
TERMINALS = 2


class ModelError(ValueError):
    """A model is invalid for the requested numerical operation."""


@dataclass(frozen=True, slots=True)
class Chain:
    kind: Kind
    states: list[str]
    names: list[str]
    initial: Array
    matrix: Array
    embedded: Array
    routing: Array | None
    warnings: list[str]

    def describe(self) -> Matrices:
        return Matrices(
            states=self.states,
            names=self.names,
            initial=self.initial.tolist(),
            matrix=self.matrix.tolist(),
            routing=self.routing.tolist() if self.routing is not None else None,
            warnings=self.warnings,
        )


def _stochastic(values: Array, label: str) -> None:
    if np.any((values < 0) | (values > 1)):
        raise ModelError(f"{label}: імовірності мають належати [0, 1].")
    deviations = np.abs(values.sum(axis=-1) - 1)
    if np.any(deviations > TOL):
        row = int(np.argmax(deviations)) + 1
        raise ModelError(f"{label}: сума ймовірностей у рядку {row} має дорівнювати 1.")


def _initial(system: SoftwareSystem, ids: dict[str, int], size: int) -> Array:
    executors: dict[str, list[tuple[int, float]]] = {task.id: [] for task in system.tasks}
    for assignment in system.assignments:
        executors[assignment.task_id].append((ids[assignment.module_id], assignment.weight))
    for task in system.tasks:
        if not any(weight > 0 for _, weight in executors[task.id]):
            raise ModelError(f"Завдання «{task.name}» потребує виконавця з додатною вагою.")
    if system.initial is not None:
        if len(system.initial) != size:
            raise ModelError(f"Початковий вектор має містити {size} значень.")
        initial = np.asarray(system.initial, dtype=float)
        _stochastic(initial, "Початковий вектор")
        initial /= initial.sum()
        return initial
    initial = np.zeros(size)
    if not system.tasks:
        initial[0] = 1
        return initial
    total = sum(task.weight for task in system.tasks)
    if total <= 0:
        raise ModelError("Хоча б одне вхідне завдання має мати додатну вагу.")
    for task in system.tasks:
        assignments = executors[task.id]
        assignment_total = sum(weight for _, weight in assignments)
        for index, weight in assignments:
            initial[index] += (task.weight / total) * (weight / assignment_total)
    return initial


def _automatic(system: SoftwareSystem, ids: dict[str, int]) -> tuple[Array, Array, Array]:
    size = len(ids)
    routing = np.zeros((size - TERMINALS, size))
    for transition in system.transitions:
        routing[ids[transition.source], ids[transition.target]] = transition.probability
    _stochastic(routing, "Умовна маршрутизація")
    routing /= routing.sum(axis=1, keepdims=True)
    embedded = np.eye(size)
    rates = np.zeros(size)
    for index, module in enumerate(system.modules):
        embedded[index] = module.reliability * routing[index]
        embedded[index, -1] = 1 - module.reliability
        rates[index] = module.rate
    generator = embedded * rates[:, None]
    np.fill_diagonal(generator, 0)
    np.fill_diagonal(generator, -generator.sum(axis=1))
    return routing, embedded, generator


def _manual(values: list[list[float]], kind: Kind, size: int) -> tuple[Array, Array]:
    if len(values) != size or any(len(row) != size for row in values):
        raise ModelError(f"Матриця має розмір {size} × {size}.")
    matrix = np.asarray(values, dtype=float)
    if kind == "dtmc":
        _stochastic(matrix, "P")
        if not np.array_equal(matrix[-TERMINALS:], np.eye(size)[-TERMINALS:]):
            raise ModelError("У P стани SUCCESS і FAILURE мають бути поглинаючими.")
        matrix /= matrix.sum(axis=1, keepdims=True)
        return matrix, matrix
    diagonal = np.diag(matrix)
    off_diagonal = matrix.copy()
    np.fill_diagonal(off_diagonal, 0)
    rates = off_diagonal.sum(axis=1)
    if np.any(off_diagonal < 0) or np.any(diagonal > 0) or np.any(rates > 1e6):
        raise ModelError("Перевірте знаки Q та обмеження інтенсивності виходу до 10⁶.")
    if np.any(np.abs(rates + diagonal) > TOL * np.maximum(1, rates)):
        raise ModelError("Діагональ Q має дорівнювати мінус сумі позадіагональних елементів.")
    if np.any(matrix[-TERMINALS:] != 0):
        raise ModelError("У Q рядки SUCCESS і FAILURE мають бути нульовими.")
    np.fill_diagonal(matrix, -rates)
    embedded = np.eye(size)
    moving = rates > 0
    embedded[: size - TERMINALS][~moving[: size - TERMINALS]] = 0
    embedded[moving] = off_diagonal[moving] / rates[moving, None]
    return matrix, embedded


def _diagnostics(initial: Array, embedded: Array, states: list[str]) -> list[str]:
    graph: nx.DiGraph = nx.from_numpy_array(embedded, create_using=nx.DiGraph)
    reachable: set[int] = set()
    for origin in np.flatnonzero(initial > 0):
        reachable.add(int(origin))
        reachable.update(nx.descendants(graph, int(origin)))
    warnings = []
    missing = [state for index, state in enumerate(states) if index not in reachable]
    if missing:
        warnings.append("Недосяжні стани: " + ", ".join(missing))
    for group in nx.attracting_components(graph.subgraph(reachable)):
        if max(group) < len(states) - TERMINALS:
            labels = ", ".join(states[i] for i in sorted(group))
            warnings.append(f"Замкнений клас [{labels}] може затримати виконання назавжди.")
    return warnings


def compile_chain(system: SoftwareSystem, kind: Kind) -> Chain:
    states = [m.id for m in system.modules] + [SUCCESS, FAILURE]
    names = [m.name for m in system.modules] + [SUCCESS, FAILURE]
    ids = {state: index for index, state in enumerate(states)}
    initial = _initial(system, ids, len(states))
    values = system.manual_p if kind == "dtmc" else system.manual_q
    routing = None
    if values is not None:
        matrix, embedded = _manual(values, kind, len(states))
    else:
        routing, embedded, generator = _automatic(system, ids)
        matrix = embedded if kind == "dtmc" else generator
    return Chain(
        kind,
        states,
        names,
        initial,
        matrix,
        embedded,
        routing,
        _diagnostics(initial, embedded, states),
    )
