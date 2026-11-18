"""Transportable project definitions and numerical contracts."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Kind = Literal["dtmc", "ctmc"]
SUCCESS, FAILURE = "SUCCESS", "FAILURE"
MAX_MODULES = 30
MAX_TASKS = 100
Identifier = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,48}$")]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Probability = Annotated[float, Field(ge=0, le=1)]
Weight = Annotated[float, Field(ge=0, le=1e9)]
Vector = Annotated[list[float], Field(max_length=MAX_MODULES + 2)]
Matrix = Annotated[list[Vector], Field(max_length=MAX_MODULES + 2)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ReliabilityParameters(Contract):
    reliability: Probability = 0.99
    rate: Annotated[float, Field(gt=0, le=1e6)] = 1


class Module(ReliabilityParameters):
    id: Identifier
    name: Label


class Task(Contract):
    id: Identifier
    name: Label
    weight: Weight = 1


class ModuleTaskAssignment(Contract):
    module_id: Identifier
    task_id: Identifier
    weight: Weight = 1


class Transition(Contract):
    source: Identifier
    target: Identifier
    probability: Probability


class SoftwareSystem(Contract):
    modules: list[Module] = Field(min_length=1, max_length=MAX_MODULES)
    tasks: list[Task] = Field(default_factory=list, max_length=MAX_TASKS)
    assignments: list[ModuleTaskAssignment] = Field(
        default_factory=list, max_length=MAX_MODULES * MAX_TASKS
    )
    transitions: list[Transition] = Field(
        default_factory=list, max_length=MAX_MODULES * (MAX_MODULES + 1)
    )
    initial: Vector | None = None
    manual_p: Matrix | None = None
    manual_q: Matrix | None = None

    @model_validator(mode="after")
    def validate_references(self) -> Self:
        modules = {module.id for module in self.modules}
        tasks = {task.id for task in self.tasks}
        if len(modules) != len(self.modules) or len(tasks) != len(self.tasks):
            raise ValueError("Ідентифікатори модулів і завдань мають бути унікальними.")
        if modules.intersection((SUCCESS, FAILURE)):
            raise ValueError("SUCCESS і FAILURE зарезервовано для кінцевих станів.")
        assignments = set()
        for assignment in self.assignments:
            key = (assignment.module_id, assignment.task_id)
            if key in assignments or key[0] not in modules or key[1] not in tasks:
                raise ValueError("Призначення має бути унікальним і посилатися на наявні сутності.")
            assignments.add(key)
        transitions = set()
        for transition in self.transitions:
            key = (transition.source, transition.target)
            if key in transitions or key[0] not in modules or key[1] not in modules | {SUCCESS}:
                raise ValueError("Перевірте унікальність і кінці умовного переходу.")
            transitions.add(key)
        return self


class AnalysisSettings(Contract):
    kind: Kind = "dtmc"
    horizon: float = Field(default=10, ge=0, le=10000)
    points: int = Field(default=41, ge=2, le=121)
    target: Identifier | None = None

    @model_validator(mode="after")
    def validate_horizon(self) -> Self:
        if self.kind == "dtmc" and not self.horizon.is_integer():
            raise ValueError("Горизонт DTMC має бути цілою кількістю кроків.")
        return self


class AnalysisScenario(AnalysisSettings):
    name: Label


class SimulationSettings(AnalysisSettings):
    trials: int = Field(default=5000, ge=100, le=100000)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


class TimePoint(Contract):
    time: float
    distribution: list[float]
    reliability: float
    success: float
    failure: float
    running: float
    first_passage: float | None


class StateMetric(Contract):
    id: str
    name: str
    initial: float
    first_hit: float
    expected_visits: float | None


class Matrices(Contract):
    states: list[str]
    names: list[str]
    initial: list[float]
    matrix: list[list[float]]
    routing: list[list[float]] | None
    warnings: list[str]


class AnalysisResult(Matrices):
    series: list[TimePoint]
    metrics: list[StateMetric]
    ode_error: float | None
    target: str | None


class Estimate(Contract):
    metric: str
    analytical: float
    estimate: float
    error: float
    lower: float
    upper: float


class SimulationResult(Contract):
    trials: int
    seed: int
    estimates: list[Estimate]


class SensitivityItem(Contract):
    id: str
    name: str
    before: float
    after: float
    reliability: float
    gain: float


class ExampleInfo(Contract):
    id: str
    name: str
    description: str
    model: SoftwareSystem
