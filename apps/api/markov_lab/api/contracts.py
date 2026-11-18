"""HTTP payloads and response projections."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field

from markov_lab.domain.models import (
    AnalysisResult,
    AnalysisScenario,
    AnalysisSettings,
    Contract,
    Label,
    SoftwareSystem,
)

Description = Annotated[str, Field(max_length=600)]


class ProjectCreate(Contract):
    name: Label
    description: Description = ""
    model: SoftwareSystem | None = None


class ProjectPatch(Contract):
    name: Label | None = None
    description: Description | None = None
    archived: bool | None = None


class ProjectSummary(Contract):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str
    archived: bool
    created_at: datetime
    updated_at: datetime


class RevisionView(Contract):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    number: int
    created_at: datetime


class ProjectDetail(ProjectSummary):
    revision: RevisionView
    model: SoftwareSystem


class ModelSave(Contract):
    revision_id: UUID
    model: SoftwareSystem


class ScenarioCreate(AnalysisScenario):
    revision_id: UUID | None = None


class ScenarioView(Contract):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    revision_id: UUID
    name: str
    settings: AnalysisSettings
    created_at: datetime


class RunCreate(Contract):
    settings: AnalysisSettings = Field(default_factory=AnalysisSettings)
    revision_id: UUID | None = None
    scenario_id: UUID | None = None


class RunSummary(Contract):
    id: UUID
    project_id: UUID
    revision_id: UUID
    label: str
    settings: AnalysisSettings
    engine_version: str
    created_at: datetime
    reliability: float
    success: float
    failure: float
    running: float


class RunDetail(RunSummary):
    result: AnalysisResult


class ExportedModel(ProjectCreate):
    model: SoftwareSystem


class Preview(Contract):
    model: SoftwareSystem
    settings: AnalysisSettings
