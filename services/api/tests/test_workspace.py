import os
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from db import connect, migrate
from main import app
from providers import configured_provider

client = TestClient(app)
OWNER = {"Authorization": "Bearer " + "a" * 64}
OTHER = {"Authorization": "Bearer " + "b" * 64}


@pytest.fixture
def database(monkeypatch):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("AI_PROVIDER", "mock")
    migrate()
    migrate()
    with connect() as conn:
        conn.execute("TRUNCATE generations, projects")


def test_authentication_and_validation():
    assert client.get("/api/projects").status_code == 401
    assert (
        client.post("/api/projects", headers=OWNER, json={"name": " ", "locale": "en"}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/projects", headers=OWNER, json={"name": "App", "locale": "fr"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/projects/{uuid4()}/generations", headers=OWNER, json={"prompt": " "}
        ).status_code
        == 422
    )


def test_hindi_workspace_round_trip_and_ownership(database):
    assert client.get("/api/health").json() == {"status": "ok"}
    response = client.post("/api/projects", headers=OWNER, json={"name": "मेरा ऐप", "locale": "hi"})
    assert response.status_code == 201
    project = response.json()
    path = f"/api/projects/{project['id']}/generations"
    assert client.get("/api/projects", headers=OWNER).json() == [project]
    assert client.get("/api/projects", headers=OTHER).json() == []
    assert client.get(path, headers=OTHER).status_code == 404
    assert client.post(path, headers=OTHER, json={"prompt": "Hello"}).status_code == 404

    response = client.post(path, headers=OWNER, json={"prompt": "एक नोट ऐप बनाएँ"})
    assert response.status_code == 201
    generation = response.json()
    assert generation["status"] == "succeeded"
    assert "एक नोट ऐप बनाएँ" in generation["files"][0]["content"]
    assert 'lang="hi"' in generation["files"][1]["content"]
    assert client.get(path, headers=OWNER).json() == [generation]


def test_provider_failure_is_saved(database):
    class Unavailable:
        def generate(self, prompt, locale):
            raise httpx.ConnectError("offline")

    app.dependency_overrides[configured_provider] = Unavailable
    try:
        project = client.post(
            "/api/projects", headers=OWNER, json={"name": "App", "locale": "en"}
        ).json()
        path = f"/api/projects/{project['id']}/generations"
        generation = client.post(path, headers=OWNER, json={"prompt": "Build a todo app"}).json()
        assert generation["status"] == "failed"
        assert generation["files"] == []
        assert client.get(path, headers=OWNER).json() == [generation]
    finally:
        app.dependency_overrides.clear()
