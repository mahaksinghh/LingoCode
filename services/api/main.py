import hashlib
import logging
import re
from typing import Annotated, Literal
from uuid import UUID, uuid4

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, StringConstraints

from db import connect
from providers import GeneratedFile, Locale, Provider, configured_provider

app = FastAPI(title="LingoCode")
logger = logging.getLogger(__name__)


def owner_key(authorization: Annotated[str, Header()] = "") -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not re.fullmatch(r"[0-9a-f]{64}", token):
        raise HTTPException(401, "Workspace access key required", {"WWW-Authenticate": "Bearer"})
    return hashlib.sha256(token.encode()).hexdigest()


Owner = Annotated[str, Depends(owner_key)]
AI = Annotated[Provider, Depends(configured_provider)]


class NewProject(BaseModel):
    name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[^\x00]*$"
        ),
    ]
    locale: Locale


class Project(NewProject):
    id: UUID


class GenerationRequest(BaseModel):
    prompt: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=6000, pattern=r"^[^\x00]*$"
        ),
    ]


class Generation(BaseModel):
    id: UUID
    prompt: str
    status: Literal["running", "succeeded", "failed"]
    files: list[GeneratedFile]


@app.get("/api/health")
def health():
    with connect() as conn:
        conn.execute("SELECT 1 FROM projects LIMIT 1")
    return {"status": "ok"}


@app.get("/api/projects")
def list_projects(owner: Owner) -> list[Project]:
    with connect() as conn:
        return conn.execute(
            "SELECT id, name, locale FROM projects WHERE owner = %s ORDER BY created_at DESC, id",
            (owner,),
        ).fetchall()


@app.post("/api/projects", status_code=201)
def create_project(project: NewProject, owner: Owner) -> Project:
    with connect() as conn:
        return conn.execute(
            "INSERT INTO projects (id, owner, name, locale) VALUES (%s, %s, %s, %s) "
            "RETURNING id, name, locale",
            (uuid4(), owner, project.name, project.locale),
        ).fetchone()


def owned_project(conn, project_id: UUID, owner: str):
    project = conn.execute(
        "SELECT locale FROM projects WHERE id = %s AND owner = %s", (project_id, owner)
    ).fetchone()
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@app.get("/api/projects/{project_id}/generations")
def list_generations(project_id: UUID, owner: Owner) -> list[Generation]:
    with connect() as conn:
        owned_project(conn, project_id, owner)
        return conn.execute(
            "SELECT id, prompt, status, files FROM generations WHERE project_id = %s "
            "ORDER BY created_at DESC, id",
            (project_id,),
        ).fetchall()


@app.post("/api/projects/{project_id}/generations", status_code=201)
def generate(
    project_id: UUID, payload: GenerationRequest, owner: Owner, provider: AI
) -> Generation:
    job_id = uuid4()
    with connect() as conn:
        project = owned_project(conn, project_id, owner)
        conn.execute(
            "INSERT INTO generations (id, project_id, prompt, status) "
            "VALUES (%s, %s, %s, 'running')",
            (job_id, project_id, payload.prompt),
        )

    try:
        output = provider.generate(payload.prompt, project["locale"])
        files = output.model_dump()["files"]
        status = "succeeded"
    except (httpx.HTTPError, ValueError, TypeError, LookupError) as exc:
        logger.warning("Generation %s failed (%s)", job_id, type(exc).__name__)
        files = []
        status = "failed"

    with connect() as conn:
        return conn.execute(
            "UPDATE generations SET status = %s, files = %s WHERE id = %s "
            "RETURNING id, prompt, status, files",
            (status, Jsonb(files), job_id),
        ).fetchone()
