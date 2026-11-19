CREATE TABLE accounts (
    id uuid PRIMARY KEY,
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL
);
CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiring ON sessions (expires_at);

ALTER TABLE projects DROP CONSTRAINT projects_locale_check;
ALTER TABLE projects ADD CHECK (locale IN ('en', 'hi', 'ta', 'bn'));
ALTER TABLE projects ADD COLUMN archived boolean NOT NULL DEFAULT false;

ALTER TABLE generations DROP CONSTRAINT generations_status_check;
ALTER TABLE generations ADD CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
ALTER TABLE generations
    ADD COLUMN action text NOT NULL DEFAULT 'build',
    ADD COLUMN spec jsonb,
    ADD COLUMN source_id uuid REFERENCES generations,
    ADD COLUMN provider text,
    ADD COLUMN attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN lease_until timestamptz,
    ADD CHECK (action IN ('plan', 'build', 'revise', 'debug', 'restore'));
UPDATE generations SET status = 'failed' WHERE status = 'running';
CREATE INDEX generations_worker ON generations (created_at, id)
    WHERE status IN ('queued', 'running');
CREATE UNIQUE INDEX generations_active_project ON generations (project_id)
    WHERE status IN ('queued', 'running');
