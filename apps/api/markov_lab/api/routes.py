"""Versioned routes for the lab, with typed request and response bodies."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from markov_lab.api.contracts import (
    ExportedModel,
    ModelSave,
    Preview,
    ProjectCreate,
    ProjectDetail,
    ProjectPatch,
    ProjectSummary,
    RevisionView,
    RunCreate,
    RunDetail,
    RunSummary,
    ScenarioCreate,
    ScenarioView,
)
from markov_lab.application.analyses import COMPUTE_SLOTS, create_run, run_by_id
from markov_lab.application.examples import examples
from markov_lab.application.exports import matrix_csv, run_pdf, series_csv
from markov_lab.application.projects import (
    Missing,
    create_project,
    get_model,
    project_by_id,
    revision_by_id,
    revision_query,
    save_model,
)
from markov_lab.domain.models import (
    AnalysisResult,
    AnalysisSettings,
    ExampleInfo,
    Kind,
    Matrices,
    SensitivityItem,
    SimulationResult,
    SimulationSettings,
    SoftwareSystem,
)
from markov_lab.engine.analysis import analyze, check_horizon
from markov_lab.engine.build import ModelError, compile_chain
from markov_lab.engine.experiments import sensitivity, simulate
from markov_lab.persistence.db import session
from markov_lab.persistence.models import Project, Revision, Run, Scenario

router = APIRouter(prefix="/api/v1")
DB = Annotated[Session, Depends(session)]
Format = Literal["json", "matrix.csv", "results.csv", "pdf"]


def _detail(db: Session, project: Project) -> ProjectDetail:
    revision = revision_by_id(db, project.id)
    return ProjectDetail(
        **ProjectSummary.model_validate(project).model_dump(),
        revision=RevisionView.model_validate(revision),
        model=get_model(revision),
    )


def _run_summary(run: Run, project_id: UUID, result: AnalysisResult) -> RunSummary:
    end = result.series[-1]
    return RunSummary(
        id=run.id,
        project_id=project_id,
        revision_id=run.revision_id,
        label=run.label,
        settings=AnalysisSettings.model_validate(run.settings),
        engine_version=run.engine_version,
        created_at=run.created_at,
        reliability=end.reliability,
        success=end.success,
        failure=end.failure,
        running=end.running,
    )


def _run_detail(db: Session, run: Run) -> RunDetail:
    project_id = db.scalar(select(Revision.project_id).where(Revision.id == run.revision_id))
    if project_id is None:
        raise Missing("Версію запуску не знайдено.")
    result = AnalysisResult.model_validate(run.result)
    return RunDetail(**_run_summary(run, project_id, result).model_dump(), result=result)


def _attachment(body: str | bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/examples", operation_id="listExamples")
def list_examples() -> list[ExampleInfo]:
    return examples()


@router.get("/projects", operation_id="listProjects")
def list_projects(db: DB) -> list[ProjectSummary]:
    query = select(Project).order_by(Project.updated_at.desc(), Project.id)
    return [ProjectSummary.model_validate(project) for project in db.scalars(query)]


@router.post("/projects", status_code=201, operation_id="createProject")
def new_project(data: ProjectCreate, db: DB) -> ProjectDetail:
    model = data.model or SoftwareSystem.model_validate(
        {
            "modules": [{"id": "entry", "name": "Вхідний модуль"}],
            "transitions": [{"source": "entry", "target": "SUCCESS", "probability": 1}],
        }
    )
    return _detail(db, create_project(db, data.name, data.description, model))


@router.get("/projects/{key}", operation_id="getProject")
def read_project(key: UUID, db: DB) -> ProjectDetail:
    return _detail(db, project_by_id(db, key))


@router.patch("/projects/{key}", operation_id="patchProject")
def patch_project(key: UUID, data: ProjectPatch, db: DB) -> ProjectDetail:
    item = project_by_id(db, key, lock=True)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    return _detail(db, item)


@router.delete("/projects/{key}", status_code=204, operation_id="deleteProject")
def delete_project(key: UUID, db: DB) -> Response:
    db.delete(project_by_id(db, key, lock=True))
    db.commit()
    return Response(status_code=204)


@router.post("/projects/{key}/duplicate", status_code=201, operation_id="duplicateProject")
def duplicate_project(key: UUID, db: DB) -> ProjectDetail:
    item = project_by_id(db, key)
    model = get_model(revision_by_id(db, key))
    return _detail(db, create_project(db, f"{item.name[:92]} (копія)", item.description, model))


@router.put("/projects/{key}/model", operation_id="saveModel")
def update_model(key: UUID, data: ModelSave, db: DB) -> RevisionView:
    return RevisionView.model_validate(save_model(db, key, data.revision_id, data.model))


@router.get("/projects/{key}/revisions", operation_id="listRevisions")
def list_revisions(key: UUID, db: DB) -> list[RevisionView]:
    project_by_id(db, key)
    return [RevisionView.model_validate(item) for item in db.scalars(revision_query(key))]


@router.get("/projects/{key}/model.json", operation_id="exportProject")
def export_project(key: UUID, db: DB, revision_id: UUID | None = None) -> Response:
    item = project_by_id(db, key)
    model = get_model(revision_by_id(db, key, revision_id))
    payload = ExportedModel(name=item.name, description=item.description, model=model)
    return _attachment(payload.model_dump_json(indent=2), "application/json", f"model-{key}.json")


@router.post("/validate/{kind}", operation_id="validateModel")
def validate_model(kind: Kind, data: SoftwareSystem) -> Matrices:
    return compile_chain(data, kind).describe()


@router.get("/projects/{key}/scenarios", operation_id="listScenarios")
def list_scenarios(key: UUID, db: DB) -> list[ScenarioView]:
    project_by_id(db, key)
    query = select(Scenario).join(Revision).where(Revision.project_id == key)
    return [
        ScenarioView.model_validate(item)
        for item in db.scalars(query.order_by(Scenario.created_at.desc()))
    ]


@router.post("/projects/{key}/scenarios", status_code=201, operation_id="createScenario")
def new_scenario(key: UUID, data: ScenarioCreate, db: DB) -> ScenarioView:
    revision = revision_by_id(db, key, data.revision_id)
    settings = AnalysisSettings.model_validate(data.model_dump(exclude={"name", "revision_id"}))
    chain = compile_chain(get_model(revision), settings.kind)
    check_horizon(chain, settings.horizon)
    if settings.target and settings.target not in chain.states:
        raise ModelError("Обраного стану першого проходу немає в моделі.")
    item = Scenario(
        revision_id=revision.id,
        name=data.name,
        settings=settings.model_dump(mode="json"),
    )
    db.add(item)
    db.commit()
    return ScenarioView.model_validate(item)


@router.get("/runs", operation_id="listRuns")
def list_runs(db: DB, project_id: UUID | None = None) -> list[RunSummary]:
    query = select(Run, Revision.project_id).join(Revision)
    if project_id is not None:
        query = query.where(Revision.project_id == project_id)
    return [
        _run_summary(run, key, AnalysisResult.model_validate(run.result))
        for run, key in db.execute(query.order_by(Run.created_at.desc()).limit(100))
    ]


@router.post("/projects/{key}/runs", status_code=201, operation_id="createRun")
def new_run(key: UUID, data: RunCreate, db: DB) -> RunDetail:
    return _run_detail(db, create_run(db, key, data.settings, data.revision_id, data.scenario_id))


@router.get("/runs/{key}", operation_id="getRun")
def get_run(key: UUID, db: DB) -> RunDetail:
    return _run_detail(db, run_by_id(db, key))


@router.get("/runs/{key}/export/{format}", operation_id="exportRun")
def export_run(key: UUID, format: Format, db: DB) -> Response:
    item = run_by_id(db, key)
    run = _run_detail(db, item)
    if format == "pdf":
        return _attachment(
            run_pdf(run.result, run.settings, str(key)), "application/pdf", f"run-{key}.pdf"
        )
    if format == "json":
        revision = revision_by_id(db, run.project_id, run.revision_id)
        content = (
            '{"run":'
            + run.model_dump_json()
            + ',"model":'
            + get_model(revision).model_dump_json()
            + "}"
        )
        return _attachment(content, "application/json", f"run-{key}.json")
    csv = (
        matrix_csv(run.result, run.settings.kind)
        if format == "matrix.csv"
        else series_csv(run.result)
    )
    return _attachment("\ufeff" + csv, "text/csv", f"run-{key}-{format}")


@router.post("/projects/{key}/simulate", operation_id="simulateProject")
def simulate_project(
    key: UUID,
    data: SimulationSettings,
    db: DB,
    revision_id: UUID | None = None,
) -> SimulationResult:
    system = get_model(revision_by_id(db, key, revision_id))
    db.rollback()
    if not COMPUTE_SLOTS.acquire(blocking=False):
        raise ModelError("Обчислювальні слоти зайнято. Спробуйте знову.")
    try:
        return simulate(compile_chain(system, data.kind), data)
    finally:
        COMPUTE_SLOTS.release()


@router.post("/projects/{key}/sensitivity", operation_id="sensitivityProject")
def sensitivity_project(
    key: UUID,
    data: AnalysisSettings,
    db: DB,
    delta: Annotated[float, Query(gt=0, le=1)] = 0.01,
    revision_id: UUID | None = None,
) -> list[SensitivityItem]:
    system = get_model(revision_by_id(db, key, revision_id))
    db.rollback()
    if not COMPUTE_SLOTS.acquire(blocking=False):
        raise ModelError("Обчислювальні слоти зайнято. Спробуйте знову.")
    try:
        return sensitivity(system, data, delta)
    finally:
        COMPUTE_SLOTS.release()


@router.post("/preview", operation_id="previewAnalysis")
def preview(data: Preview) -> AnalysisResult:
    if not COMPUTE_SLOTS.acquire(blocking=False):
        raise ModelError("Обчислювальні слоти зайнято. Спробуйте знову.")
    try:
        return analyze(compile_chain(data.model, data.settings.kind), data.settings)
    finally:
        COMPUTE_SLOTS.release()
