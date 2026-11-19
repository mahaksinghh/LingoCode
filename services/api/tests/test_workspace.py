import json
import os
from io import BytesIO
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient

from auth import digest
from db import connect, migrate
from main import app
from worker import claim, process_one

client = TestClient(app)
PASSWORD = "sample-passphrase-2026"


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
        conn.execute("TRUNCATE generations, projects, sessions, accounts")


def signed_in(email="builder@example.com", legacy_key=None):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "legacy_key": legacy_key},
    )
    assert response.status_code == 201
    return {"Authorization": "Bearer " + response.json()["token"]}


def project(owner, name="मेरा ऐप", locale="hi"):
    response = client.post("/api/projects", headers=owner, json={"name": name, "locale": locale})
    assert response.status_code == 201
    return response.json()


def queue(path, owner, prompt, action, source_id=None):
    response = client.post(
        path, headers=owner, json={"prompt": prompt, "action": action, "source_id": source_id}
    )
    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "queued"
    return job


def complete(path, owner, job):
    assert process_one()
    response = client.get(path + "/" + job["id"], headers=owner)
    assert response.status_code == 200
    return response.json()


def test_authentication_requires_token():
    assert client.get("/api/projects").status_code == 401
    assert (
        client.post("/api/auth/register", json={"email": "bad", "password": "short"}).status_code
        == 422
    )


def test_account_login_and_legacy_import(database):
    old_key = "a" * 64
    project_id = uuid4()
    with connect() as conn:
        conn.execute(
            "INSERT INTO projects (id, owner, name, locale) VALUES (%s, %s, 'Old app', 'en')",
            (project_id, digest(old_key)),
        )
    owner = signed_in(legacy_key=old_key)
    assert client.get("/api/projects", headers=owner).json()[0]["id"] == str(project_id)
    assert (
        client.get("/api/projects", headers={"Authorization": "Bearer " + old_key}).status_code
        == 401
    )
    assert client.post("/api/auth/logout", headers=owner).status_code == 204
    assert client.get("/api/projects", headers=owner).status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={
                "email": "BUILDER@example.com",
                "password": "wrong-password",
            },
        ).status_code
        == 401
    )
    response = client.post(
        "/api/auth/login", json={"email": "BUILDER@example.com", "password": PASSWORD}
    )
    assert response.status_code == 200
    login = {"Authorization": "Bearer " + response.json()["token"]}
    assert client.get("/api/projects", headers=login).json()[0]["id"] == str(project_id)


def test_hindi_plan_build_revise_restore_export_and_ownership(database):
    assert client.get("/api/health").json() == {"status": "ok"}
    owner = signed_in()
    other = signed_in("other@example.com")
    created = project(owner)
    path = f"/api/projects/{created['id']}/generations"
    assert client.get("/api/projects", headers=other).json() == []
    assert client.get(path, headers=other).status_code == 404
    assert client.post(path, headers=other, json={"prompt": "Hello"}).status_code == 404

    pending = queue(path, owner, "एक कार्य ऐप बनाएँ", "plan")
    assert client.post(path, headers=owner, json={"prompt": "duplicate"}).status_code == 409
    plan = complete(path, owner, pending)
    assert plan["status"] == "succeeded"
    assert not plan["files"]
    assert plan["spec"]["fields"][-1]["label"] == "पूरा"
    build = complete(path, owner, queue(path, owner, plan["prompt"], "build", plan["id"]))
    assert build["spec"] == plan["spec"]
    assert build["status"] == "succeeded"

    revised = complete(
        path, owner, queue(path, owner, "Add quantity and rose", "revise", build["id"])
    )
    assert revised["spec"]["accent"] == "rose"
    assert revised["spec"]["fields"][-1]["key"] == "quantity"
    diagnosed = complete(
        path, owner, queue(path, owner, "Review field labels", "debug", revised["id"])
    )
    assert diagnosed["status"] == "succeeded"
    assert "नमूना रिकॉर्ड" in diagnosed["spec"]["steps"][1]
    export_path = path + "/" + build["id"] + "/export"
    assert client.get(export_path, headers=other).status_code == 404
    with ZipFile(BytesIO(client.get(export_path, headers=owner).content)) as archive:
        assert {"Dockerfile", "compose.yaml", "api/main.py", "web/src/main.tsx"} <= set(
            archive.namelist()
        )
        assert all(file.external_attr >> 16 == 0o100644 for file in archive.infolist())
        assert json.loads(archive.read("web/src/spec.json"))["locale"] == "hi"

    response = client.post(path + "/" + build["id"] + "/restore", headers=owner)
    assert response.status_code == 201
    restored = response.json()
    assert restored["files"] == build["files"]
    history = client.get(path, headers=owner).json()
    assert history[0]["id"] == restored["id"] and "files" not in history[0]
    project_path = path.removesuffix("/generations")
    archived = client.patch(project_path, headers=owner, json={"name": "Renamed", "archived": True})
    assert archived.json()["archived"]
    assert client.post(path, headers=owner, json={"prompt": "Archived"}).status_code == 409


def test_worker_recovers_an_abandoned_job_and_records_provider_failure(database, monkeypatch):
    owner = signed_in()
    item = project(owner, "Tamil inventory", "ta")
    path = f"/api/projects/{item['id']}/generations"
    job = queue(path, owner, "அளவு", "build")
    assert claim()["id"] == UUID(job["id"])
    assert not process_one()
    with connect() as conn:
        conn.execute("UPDATE generations SET lease_until = now() WHERE id = %s", (job["id"],))
    completed = complete(path, owner, job)
    assert completed["status"] == "succeeded"
    assert completed["spec"]["fields"][-1]["label"] == "அளவு"
    monkeypatch.setenv("AI_PROVIDER", "compatible")
    failed = complete(path, owner, queue(path, owner, "Test unavailable provider", "plan"))
    assert failed["status"] == "failed" and not failed["files"]
