import json
import logging
import time

import httpx
import psycopg
from psycopg.types.json import Jsonb

from db import connect
from providers import compatible_provider, provider_mode
from studio import LANGUAGES, AppSpec, build_files, demo_spec

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3


def claim():
    with connect() as conn:
        conn.execute(
            "UPDATE generations SET status = 'failed', lease_until = NULL "
            "WHERE status = 'running' AND lease_until <= now() AND attempts >= %s",
            (MAX_ATTEMPTS,),
        )
        return conn.execute(
            """
            WITH pending AS (
                SELECT id FROM generations
                WHERE status = 'queued' OR (status = 'running' AND lease_until <= now())
                ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            UPDATE generations g
            SET status = 'running', attempts = attempts + 1, lease_until = now() + interval '2 min'
            FROM pending, projects p
            WHERE g.id = pending.id AND p.id = g.project_id
            RETURNING g.*, p.name, p.locale,
                (SELECT spec FROM generations WHERE id = g.source_id) AS source
            """
        ).fetchone()


def generate_spec(job) -> AppSpec:
    source = AppSpec.model_validate(job["source"]) if job["source"] else None
    action = job["action"]
    if source and action == "build":
        return source
    if job["provider"] == "mock":
        return demo_spec(job["name"], job["prompt"], job["locale"], action, source)

    instructions = (
        "Design a single-table record-management web application. Only use the given field kinds. "
        "Create concise implementation steps. For revise/debug, preserve existing field keys "
        "unless the user asks to change them. For debug, explain the likely problem and resolution "
        "in the steps. Respond only with a JSON object matching this JSON Schema: "
        + json.dumps(AppSpec.model_json_schema())
    )
    return AppSpec.model_validate(
        compatible_provider().complete(
            instructions,
            {
                "project": job["name"],
                "language": LANGUAGES[job["locale"]],
                "action": action,
                "request": job["prompt"],
                "existing_spec": job["source"],
            },
        )
    )


def process_one() -> bool:
    job = claim()
    if job is None:
        return False
    try:
        spec = generate_spec(job)
        files = (
            []
            if job["action"] == "plan"
            else [item.model_dump() for item in build_files(spec, job["locale"])]
        )
        status = "succeeded"
    except (httpx.HTTPError, ValueError, TypeError, LookupError, OSError) as exc:
        logger.warning("Generation %s failed (%s)", job["id"], type(exc).__name__)
        spec, files, status = None, [], "failed"

    with connect() as conn:
        conn.execute(
            "UPDATE generations SET status = %s, spec = %s, files = %s, lease_until = NULL "
            "WHERE id = %s AND status = 'running' AND attempts = %s",
            (
                status,
                Jsonb(spec.model_dump()) if spec else None,
                Jsonb(files),
                job["id"],
                job["attempts"],
            ),
        )
    return True


def run():
    logging.basicConfig(level=logging.INFO)
    if provider_mode() == "compatible":
        compatible_provider()
    logger.info("Generation worker started")
    while True:
        try:
            delay = 0 if process_one() else 0.8
        except psycopg.OperationalError:
            logger.warning("Database unavailable. Retrying.")
            delay = 2
        time.sleep(delay)


if __name__ == "__main__":
    run()
