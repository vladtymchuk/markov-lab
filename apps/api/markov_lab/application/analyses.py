"""Analysis operations on a fixed model revision."""

from threading import BoundedSemaphore
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from markov_lab.application.projects import Missing, get_model, revision_by_id
from markov_lab.domain.models import AnalysisSettings
from markov_lab.engine.analysis import analyze
from markov_lab.engine.build import ModelError, compile_chain
from markov_lab.persistence.models import Revision, Run, Scenario

ENGINE_VERSION = "1.0.0"
COMPUTE_SLOTS = BoundedSemaphore(2)


def create_run(
    db: Session,
    project_id: UUID,
    settings: AnalysisSettings,
    revision_id: UUID | None,
    scenario_id: UUID | None,
) -> Run:
    label = settings.kind.upper()
    if scenario_id is not None:
        scenario = db.scalar(
            select(Scenario)
            .join(Revision)
            .where(Scenario.id == scenario_id, Revision.project_id == project_id)
        )
        if scenario is None:
            raise Missing("Сценарій не знайдено.")
        revision_id = scenario.revision_id
        settings = AnalysisSettings.model_validate(scenario.settings)
        label = scenario.name
    revision = revision_by_id(db, project_id, revision_id)
    snapshot = get_model(revision)
    key = revision.id
    db.rollback()
    if not COMPUTE_SLOTS.acquire(blocking=False):
        raise ModelError("Обчислювальні слоти зайнято. Повторіть запуск за мить.")
    try:
        result = analyze(compile_chain(snapshot, settings.kind), settings)
    finally:
        COMPUTE_SLOTS.release()
    run = Run(
        revision_id=key,
        label=label,
        settings=settings.model_dump(mode="json"),
        result=result.model_dump(mode="json"),
        engine_version=ENGINE_VERSION,
    )
    db.add(run)
    db.commit()
    return run


def run_by_id(db: Session, key: UUID) -> Run:
    run = db.get(Run, key)
    if run is None:
        raise Missing("Запуск не знайдено.")
    return run
