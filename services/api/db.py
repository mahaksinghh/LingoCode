import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def connect():
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def migrate():
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(76421001)")
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)")
        applied = {row["name"] for row in conn.execute("SELECT name FROM schema_migrations")}
        for path in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
            if path.name not in applied:
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute("INSERT INTO schema_migrations VALUES (%s)", (path.name,))


if __name__ == "__main__":
    migrate()
