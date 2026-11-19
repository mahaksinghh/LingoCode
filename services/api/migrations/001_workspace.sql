CREATE TABLE projects (
    id uuid PRIMARY KEY,
    owner text NOT NULL,
    name text NOT NULL,
    locale text NOT NULL CHECK (locale IN ('en', 'hi')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_created ON projects (owner, created_at DESC);

CREATE TABLE generations (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects (id),
    prompt text NOT NULL,
    status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    files jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generations_project_created ON generations (project_id, created_at DESC);
