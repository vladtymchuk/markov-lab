"""Transaction boundaries and lookup rules for project aggregates."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from markov_lab.domain.models import SoftwareSystem
from markov_lab.engine.build import ModelError
from markov_lab.persistence.models import Project, Revision


class Missing(LookupError):
    pass


class Conflict(ValueError):
    pass


def project_by_id(db: Session, key: UUID, *, lock: bool = False) -> Project:
    project = db.get(Project, key, with_for_update=lock)
    if project is None:
        raise Missing("Проєкт не знайдено.")
    return project


def revision_query(key: UUID) -> Select[tuple[Revision]]:
    return select(Revision).where(Revision.project_id == key).order_by(Revision.number.desc())


def revision_by_id(db: Session, key: UUID, revision_key: UUID | None = None) -> Revision:
    statement = revision_query(key)
    if revision_key is not None:
        statement = statement.where(Revision.id == revision_key)
    item = db.scalar(statement.limit(1))
    if item is None:
        raise Missing("Версію моделі не знайдено.")
    return item


def get_model(item: Revision) -> SoftwareSystem:
    return SoftwareSystem.model_validate(item.model)


def create_project(db: Session, name: str, description: str, model: SoftwareSystem) -> Project:
    project = Project(name=name, description=description)
    db.add(project)
    db.flush()
    db.add(Revision(project_id=project.id, number=1, model=model.model_dump(mode="json")))
    db.commit()
    return project


def save_model(db: Session, key: UUID, base: UUID, model: SoftwareSystem) -> Revision:
    project = project_by_id(db, key, lock=True)
    latest = revision_by_id(db, key)
    if project.archived:
        raise ModelError("Відновіть проєкт з архіву перед редагуванням моделі.")
    if base != latest.id:
        raise Conflict("З’явилася новіша версія. Відкрийте модель повторно.")
    payload = model.model_dump(mode="json")
    if payload == latest.model:
        return latest
    new = Revision(project_id=key, number=latest.number + 1, model=payload)
    project.updated_at = datetime.now(UTC)
    db.add(new)
    db.commit()
    return new
