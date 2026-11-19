# LingoCode Studio

LingoCode is an Indic-first builder for full-stack record-management apps
such as task trackers, inventory lists, and team directories. Describe an
app in your language, review the plan, build it, try the working form, and
download the source. Every export includes React, FastAPI, PostgreSQL,
Docker Compose, and an optional GitHub Container Registry workflow.

## Run LingoCode

Requires Docker with Compose v2.

```sh
cp .env.example .env
docker compose up --build --wait
```

Open http://127.0.0.1:8080 and create an account. Projects and job history
live in PostgreSQL and are available when you sign in on another device
against the same installation. If this browser was used with the initial
LingoCode workspace, signing in imports projects owned by its old local key.

1. Create a project named **कार्य प्रबंधक** and choose **हिन्दी** as the output language.
2. Enter **इंडिगो रंग का कार्य ऐप** and choose **Plan app**.
3. Review the fields and choose **Build this plan**. Add, edit, and remove a record in **Live preview**.
4. Choose **Revise**, enter **Add quantity**, and apply it. Use **Activity** to inspect or restore an older snapshot.
5. Choose **Download ZIP**. Extract the archive and run `docker compose up --build --wait` from the extracted directory. Open http://127.0.0.1:8090.

The studio UI is available in English and Hindi. App output and dictation
language choices include English, Hindi, Tamil, and Bengali. Dictation uses the
browser's speech service when supported. Typed prompts always work.

## Generation modes

The default **Template mode** works with no AI credentials. It uses the project
title, output language, and supported prompt keywords to define fields and
themes. Try `task`, `inventory`, `quantity`, `indigo`, `rose`, or their supported
localized equivalents.

For AI planning, revision, and diagnostic guidance, configure a server-side
Chat Completions-compatible endpoint in `.env`:

```dotenv
AI_PROVIDER=compatible
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=
AI_MODEL=
```

Restart the stack with `docker compose up --build --wait`. The model produces
a validated app specification. LingoCode turns it into a tested application
template with one record type and up to six text, number, or checkbox fields.
Debugging uses the prompt and selected revision's specification. The live
preview runs the same React record interface as the exported app and uses
browser-local test data. The exported app uses its own PostgreSQL database.

## Deploy and open in VS Code

The exported directory has a Dockerfile and deployment guide. Build or publish
its image with the included manually dispatched GitHub workflow. A hosting
service needs PostgreSQL, HTTPS, `DATABASE_URL`, and `APP_PASSWORD`. LingoCode
itself has no hosting account requirement for local use.

The [VS Code companion](extensions/vscode/README.md) opens source files and
downloads exports from the studio using an existing account.

## Development and verification

Use Node 22, Python 3.12, and PostgreSQL. From `services/api`, install
`requirements-dev.txt`, set `DATABASE_URL`, and start the API with
`python -m db && uvicorn main:app --reload`. In a second terminal from that
directory run `python -m worker` with the same database URL and provider
settings. From `apps/web`, run `npm ci && npm run dev`. Vite proxies the API.

- API checks from `services/api` run with `ruff check .`, `ruff format --check .`,
  and `TEST_DATABASE_URL=... pytest -q`. The database tests truncate app tables,
  so use a disposable database.
- Web checks from `apps/web` run with `npm test` and `npm run build`.
- CI starts the Compose stack, drives the studio in Chromium, downloads a ZIP,
  builds it independently, and verifies authenticated CRUD in the exported app.

See the [operations guide](docs/operations.md) for deployment and service limits.
