import json
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import compare_digest
from typing import Annotated
from uuid import UUID, uuid4

import psycopg
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, StrictBool, StrictFloat, StrictInt, StrictStr

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "spec.json").read_text())
FIELDS = {field["key"]: field["kind"] for field in SPEC["fields"]}
login = HTTPBasic(auto_error=False)


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def require_access(credentials: Annotated[HTTPBasicCredentials | None, Depends(login)]):
    expected = os.getenv("APP_PASSWORD", "")
    if not expected:
        return
    if (
        credentials
        and credentials.username == "studio"
        and compare_digest(credentials.password.encode(), expected.encode())
    ):
        return
    raise HTTPException(401, "Sign-in required", {"WWW-Authenticate": 'Basic realm="App"'})


@asynccontextmanager
async def lifespan(app):
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(91430301)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS records (id uuid PRIMARY KEY, values jsonb NOT NULL, "
            "created_at timestamptz NOT NULL DEFAULT now())"
        )
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class Record(BaseModel):
    values: dict[str, StrictStr | StrictInt | StrictFloat | StrictBool]


def validated(payload: Record):
    if payload.values.keys() != FIELDS.keys():
        raise HTTPException(422, "Unexpected fields")
    for key, kind in FIELDS.items():
        value = payload.values[key]
        if kind == "text":
            valid = isinstance(value, str) and 0 < len(value.strip()) <= 500 and "\x00" not in value
        elif kind == "number":
            valid = value == "" or (
                type(value) in (int, float) and abs(value) <= 1e12 and math.isfinite(value)
            )
        else:
            valid = isinstance(value, bool)
        if not valid:
            raise HTTPException(422, f"Invalid value for {key}")
    return Jsonb(payload.values)


@app.get("/api/health")
def health():
    with connect() as conn:
        conn.execute("SELECT 1 FROM records LIMIT 1")
    return {"status": "ok"}


@app.get("/api/records", dependencies=[Depends(require_access)])
def records():
    with connect() as conn:
        return conn.execute(
            "SELECT id, values FROM records ORDER BY created_at DESC, id"
        ).fetchall()


@app.post("/api/records", status_code=201, dependencies=[Depends(require_access)])
def create(payload: Record):
    with connect() as conn:
        return conn.execute(
            "INSERT INTO records (id, values) VALUES (%s, %s) RETURNING id, values",
            (uuid4(), validated(payload)),
        ).fetchone()


@app.put("/api/records/{record_id}", dependencies=[Depends(require_access)])
def update(record_id: UUID, payload: Record):
    with connect() as conn:
        record = conn.execute(
            "UPDATE records SET values = %s WHERE id = %s RETURNING id, values",
            (validated(payload), record_id),
        ).fetchone()
    if record is None:
        raise HTTPException(404, "Record not found")
    return record


@app.delete("/api/records/{record_id}", status_code=204, dependencies=[Depends(require_access)])
def delete(record_id: UUID):
    with connect() as conn:
        if not conn.execute("DELETE FROM records WHERE id = %s", (record_id,)).rowcount:
            raise HTTPException(404, "Record not found")


class ProtectedFrontend(StaticFiles):
    async def __call__(self, scope, receive, send):
        # Challenge on the document request so browser API calls reuse the credentials.
        from starlette.requests import Request
        from starlette.responses import PlainTextResponse

        try:
            require_access(await login(Request(scope)))
        except HTTPException as exc:
            await PlainTextResponse(str(exc.detail), exc.status_code, headers=exc.headers)(
                scope, receive, send
            )
        else:
            await super().__call__(scope, receive, send)


app.mount("/", ProtectedFrontend(directory=ROOT / "dist", html=True), name="frontend")
