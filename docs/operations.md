# Operate LingoCode Studio

## Deployment

Compose is a local installation. Only the web gateway is published, on loopback.
The worker reads the same database as the API and is the only component that
uses the AI provider secret. Run migrations against PostgreSQL as a deployment
step before updating API and worker replicas. Route browser traffic through an
HTTPS gateway and keep the database and worker private. Manage the runtime
database credentials and model API key through server-side secrets and set
request and signup limits at the gateway before allowing public registration.

A generated app is an independent container. Use a dedicated database per app.
Configure a strong shared app password for a hosted installation and put it
behind HTTPS. For separate app users, set up identity and per-user access before
hosting customer records. Studio projects and generated apps have separate trust
boundaries.

## Accounts and authorization

Accounts store salted scrypt password hashes. Sessions use random 256-bit bearer
keys with a 14-day expiry and server-side revocation. PostgreSQL stores the
digest of each session key. Only authenticated workspace owners can list projects,
inspect revisions, request generation, restore, or download files. Sessions are
kept in browser storage and should be revoked on a shared workstation by signing
out. VS Code stores sessions using SecretStorage. This release has no email
verification, password reset, or organization roles.

The preview uses the same trusted form and list components shipped in ZIP exports.
A bounded specification defines the labels, field types and theme. Studio
treats source files and model output as data. It does not run user-supplied
programs or expose the API process to generated code. Arbitrary application
runtimes require separate infrastructure with isolation and resource limits.

## Jobs and data retention

PostgreSQL retains accounts, projects, prompts, generation statuses, plans and
file snapshots. Archive hides a project from the active list. Data removal and
retention are operator-managed. Removing the local Compose volume removes all
local Studio data. Back up the PostgreSQL databases separately from app images.
Preview records are stored under their revision in the browser and are excluded
from ZIP export. Exported app records live in that app's database.

Workers claim jobs using database locks. A job abandoned by a worker can be
claimed again after its lease expires. After three abandoned attempts the job
fails. A provider error is recorded as failed. The user can retry the request.
Provider prompts may be sent to a configured external model, and dictation may
be processed by a browser speech provider. Review the relevant privacy and
retention terms before using either with sensitive data.
