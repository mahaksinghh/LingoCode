from io import BytesIO
from typing import Annotated, Literal
from uuid import UUID, uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import FastAPI, HTTPException, Response
from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from auth import Owner, router
from db import connect
from providers import GeneratedFile, provider_mode
from studio import Action, AppSpec, Locale, text_limit

app = FastAPI(title="LingoCode")
app.include_router(router)
ACTIVE = {"queued", "running"}
PROJECT_COLUMNS = "id, name, locale, archived"
JOB_COLUMNS = "id, prompt, status, action, source_id, provider, created_at::text AS created_at"


class NewProject(BaseModel):
    name: Annotated[str, text_limit(100)]
    locale: Locale


class Project(NewProject):
    id: UUID
    archived: bool


class ProjectUpdate(BaseModel):
    name: Annotated[str, text_limit(100)]
    archived: bool


class JobRequest(BaseModel):
    prompt: Annotated[str, text_limit(6000)]
    action: Action = "build"
    source_id: UUID | None = None


class JobSummary(BaseModel):
    id: UUID
    prompt: str
    status: Literal["queued", "running", "succeeded", "failed"]
    action: Literal["plan", "build", "revise", "debug", "restore"]
    source_id: UUID | None
    provider: str | None
    created_at: str


class Job(JobSummary):
    files: list[GeneratedFile]
    spec: AppSpec | None


@app.get("/api/health")
def health():
    with connect() as conn:
        conn.execute("SELECT 1 FROM accounts LIMIT 1")
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {"provider": provider_mode()}


@app.get("/api/projects")
def list_projects(owner: Owner) -> list[Project]:
    with connect() as conn:
        return conn.execute(
            f"SELECT {PROJECT_COLUMNS} FROM projects WHERE owner = %s "
            "ORDER BY archived, created_at DESC, id",
            (owner,),
        ).fetchall()


@app.post("/api/projects", status_code=201)
def create_project(project: NewProject, owner: Owner) -> Project:
    with connect() as conn:
        return conn.execute(
            "INSERT INTO projects (id, owner, name, locale) VALUES (%s, %s, %s, %s) "
            f"RETURNING {PROJECT_COLUMNS}",
            (uuid4(), owner, project.name, project.locale),
        ).fetchone()


@app.patch("/api/projects/{project_id}")
def update_project(project_id: UUID, payload: ProjectUpdate, owner: Owner) -> Project:
    with connect() as conn:
        project = conn.execute(
            "UPDATE projects SET name = %s, archived = %s WHERE id = %s AND owner = %s "
            f"RETURNING {PROJECT_COLUMNS}",
            (payload.name, payload.archived, project_id, owner),
        ).fetchone()
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def owned_project(conn, project_id: UUID, owner: str, *, write: bool = False):
    lock = " FOR UPDATE" if write else ""
    project = conn.execute(
        f"SELECT archived FROM projects WHERE id = %s AND owner = %s{lock}", (project_id, owner)
    ).fetchone()
    if project is None:
        raise HTTPException(404, "Project not found")
    if write and project["archived"]:
        raise HTTPException(409, "Restore the project before changing it")


def owned_job(conn, project_id: UUID, job_id: UUID):
    job = conn.execute(
        f"SELECT {JOB_COLUMNS}, files, spec FROM generations WHERE id = %s AND project_id = %s",
        (job_id, project_id),
    ).fetchone()
    if job is None:
        raise HTTPException(404, "Revision not found")
    return job


@app.get("/api/projects/{project_id}/generations")
def history(project_id: UUID, owner: Owner) -> list[JobSummary]:
    with connect() as conn:
        owned_project(conn, project_id, owner)
        return conn.execute(
            f"SELECT {JOB_COLUMNS} FROM generations WHERE project_id = %s "
            "ORDER BY created_at DESC, id LIMIT 100",
            (project_id,),
        ).fetchall()


@app.get("/api/projects/{project_id}/generations/{job_id}")
def revision(project_id: UUID, job_id: UUID, owner: Owner) -> Job:
    with connect() as conn:
        owned_project(conn, project_id, owner)
        return owned_job(conn, project_id, job_id)


@app.post("/api/projects/{project_id}/generations", status_code=202)
def queue(project_id: UUID, payload: JobRequest, owner: Owner) -> JobSummary:
    mode = provider_mode()
    try:
        with connect() as conn:
            owned_project(conn, project_id, owner, write=True)
            if payload.source_id:
                source = owned_job(conn, project_id, payload.source_id)
                if source["status"] != "succeeded" or source["spec"] is None:
                    raise HTTPException(422, "Select a completed plan or app")
                if payload.action == "build":
                    mode = source["provider"]
            elif payload.action in ("revise", "debug"):
                raise HTTPException(422, "Select an app to revise or debug")
            return conn.execute(
                "INSERT INTO generations "
                "(id, project_id, prompt, status, action, source_id, provider) "
                "VALUES (%s, %s, %s, 'queued', %s, %s, %s) "
                f"RETURNING {JOB_COLUMNS}",
                (uuid4(), project_id, payload.prompt, payload.action, payload.source_id, mode),
            ).fetchone()
    except UniqueViolation as exc:
        raise HTTPException(409, "A generation is already in progress for this project") from exc


@app.post("/api/projects/{project_id}/generations/{job_id}/restore", status_code=201)
def restore(project_id: UUID, job_id: UUID, owner: Owner) -> Job:
    with connect() as conn:
        owned_project(conn, project_id, owner, write=True)
        job = owned_job(conn, project_id, job_id)
        if job["status"] != "succeeded" or not job["files"]:
            raise HTTPException(422, "Select a generated app revision")
        if conn.execute(
            "SELECT 1 FROM generations WHERE project_id = %s AND status = ANY(%s)",
            (project_id, list(ACTIVE)),
        ).fetchone():
            raise HTTPException(409, "Wait for the active generation before restoring")
        return conn.execute(
            "INSERT INTO generations (id, project_id, prompt, status, action, source_id, "
            "provider, spec, files) VALUES (%s, %s, %s, 'succeeded', 'restore', %s, %s, %s, %s) "
            f"RETURNING {JOB_COLUMNS}, spec, files",
            (
                uuid4(),
                project_id,
                job["prompt"],
                job_id,
                job["provider"],
                Jsonb(job["spec"]) if job["spec"] else None,
                Jsonb(job["files"]),
            ),
        ).fetchone()


@app.get("/api/projects/{project_id}/generations/{job_id}/export")
def export(project_id: UUID, job_id: UUID, owner: Owner):
    with connect() as conn:
        owned_project(conn, project_id, owner)
        job = owned_job(conn, project_id, job_id)
    if job["status"] != "succeeded" or not job["files"]:
        raise HTTPException(422, "Select a generated app revision")
    buffer = BytesIO()
    with ZipFile(buffer, mode="w", compression=ZIP_DEFLATED) as archive:
        for data in job["files"]:
            file = GeneratedFile.model_validate(data)
            archive.writestr(file.path, file.content)
    return Response(
        buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="lingocode-app.zip"',
            "Cache-Control": "no-store",
        },
    )
