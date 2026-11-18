import math
import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from markov_lab.application.examples import examples
from markov_lab.domain.models import AnalysisSettings
from markov_lab.engine.analysis import analyze
from markov_lab.engine.build import compile_chain
from markov_lab.main import app
from markov_lab.persistence.db import database


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    test_url = os.getenv("TEST_DATABASE_URL")
    if not test_url:
        pytest.skip("Встановіть TEST_DATABASE_URL для інтеграційних тестів PostgreSQL.")
    monkeypatch.setenv("DATABASE_URL", test_url)
    database.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    with TestClient(app) as client:
        yield client
    database().dispose()
    database.cache_clear()


def test_examples_are_working_and_basic_matches_formula() -> None:
    models = examples()
    assert len(models) == 3
    for example in models:
        for kind in ("dtmc", "ctmc"):
            settings = AnalysisSettings(kind=kind, horizon=3)
            result = analyze(compile_chain(example.model, kind), settings)
            assert len(result.metrics) == len(example.model.modules) + 2
            assert result.series[-1].success > 0
            assert result.series[-1].running >= 0
    base = models[0].model
    exact = 0.99 * 0.97 * 0.995
    settings = AnalysisSettings(horizon=3)
    assert analyze(compile_chain(base, "dtmc"), settings).series[-1].success == pytest.approx(exact)
    settings = AnalysisSettings(kind="ctmc", horizon=2)
    erlang = 1 - math.exp(-3) * (1 + 3 + 3**2 / 2)
    assert analyze(compile_chain(base, "ctmc"), settings).series[-1].success == pytest.approx(
        exact * erlang
    )


def test_redundancy_changes_success_at_equal_horizon() -> None:
    system = examples()[1].model
    settings = AnalysisSettings(horizon=2)
    redundant = analyze(compile_chain(system, "dtmc"), settings).series[-1]
    assert redundant.success == pytest.approx(0.9 * 0.95 + 0.1 * 0.99)
    for route in system.transitions:
        if route.source == "health":
            route.probability = 1 if route.target == "primary" else 0
    plain = analyze(compile_chain(system, "dtmc"), settings).series[-1]
    assert plain.success == pytest.approx(0.95)
    assert redundant.success > plain.success


def test_migration_and_health(client: TestClient) -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    assert {"projects", "revisions", "scenarios", "runs", "alembic_version"} <= set(
        inspect(database()).get_table_names()
    )
    command.check(Config("alembic.ini"))
    with Session(database()) as db:
        assert db.bind is not None and db.bind.dialect.name == "postgresql"


def test_crud_and_historical_snapshot(client: TestClient) -> None:
    root = "/api/v1"
    created = client.post(f"{root}/projects", json={"name": "API integration"})
    assert created.status_code == 201, created.text
    item = created.json()
    key = item["id"]
    path = f"{root}/projects/{key}"
    clone = None
    try:
        settings = {"kind": "dtmc", "horizon": 1, "points": 5}
        first_id = item["revision"]["id"]
        scenario = client.post(
            f"{path}/scenarios", json={**settings, "name": "Початковий", "revision_id": first_id}
        )
        assert scenario.status_code == 201, scenario.text
        item["model"]["modules"][0]["reliability"] = 0.5
        edit = {"revision_id": first_id, "model": item["model"]}
        saved = client.put(f"{path}/model", json=edit)
        assert saved.status_code == 200, saved.text
        assert saved.json()["number"] == 2
        assert client.put(f"{path}/model", json=edit).status_code == 409
        renamed = client.patch(path, json={"name": "Перейменований"})
        assert renamed.json()["name"] == "Перейменований"

        old = client.post(f"{path}/runs", json={"scenario_id": scenario.json()["id"]})
        assert old.status_code == 201, old.text
        data = old.json()
        assert data["success"] == pytest.approx(0.99)
        assert data["revision_id"] == first_id
        now = client.post(f"{path}/runs", json={"settings": settings})
        assert now.status_code == 201, now.text
        assert now.json()["success"] == pytest.approx(0.5)
        assert len(client.get(f"{root}/runs?project_id={key}").json()) == 2
        assert client.get(f"{path}/revisions").json()[0]["number"] == 2
        assert client.get(f"{path}/scenarios").json()[0]["name"] == "Початковий"
        statistical = client.post(f"{path}/simulate", json={**settings, "trials": 10000})
        assert statistical.status_code == 200, statistical.text
        assert statistical.json()["estimates"][1]["analytical"] == pytest.approx(0.5)
        improved = client.post(f"{path}/sensitivity?delta=0.2", json=settings)
        assert improved.status_code == 200, improved.text
        assert improved.json()[0]["gain"] == pytest.approx(0.2)
        export = f"{root}/runs/{data['id']}/export"
        snapshot = client.get(f"{export}/json").json()
        assert snapshot["model"]["modules"][0]["reliability"] == 0.99
        assert snapshot["run"]["result"] == data["result"]
        assert "reliability" in client.get(f"{export}/results.csv").text
        assert "p0" in client.get(f"{export}/matrix.csv").text
        assert client.get(f"{export}/pdf").content.startswith(b"%PDF")
        assert (
            client.get(f"{path}/model.json?revision_id={first_id}").json()["model"]
            == snapshot["model"]
        )

        cloned = client.post(f"{path}/duplicate")
        assert cloned.status_code == 201, cloned.text
        clone = cloned.json()["id"]
        assert cloned.json()["model"]["modules"][0]["reliability"] == 0.5
        assert client.patch(path, json={"archived": True}).json()["archived"]
        assert (
            client.put(
                f"{path}/model", json={"revision_id": saved.json()["id"], "model": item["model"]}
            ).status_code
            == 422
        )
    finally:
        if clone:
            client.delete(f"{root}/projects/{clone}")
        deleted = client.delete(path)
        assert deleted.status_code == 204
        assert client.get(path).status_code == 404


def test_api_errors_and_limits() -> None:
    with TestClient(app) as client:
        preview = client.post(
            "/api/v1/preview", json={"settings": {"kind": "dtmc", "horizon": 0.5}}
        )
        assert preview.status_code == 422
        assert preview.json()["error"]["code"] == "validation"
        assert client.post("/api/v1/projects", content="x" * 1_000_001).status_code == 413
        assert client.get("/invalid").json()["error"]["code"] == "http"
