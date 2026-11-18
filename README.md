# LingoCode

LingoCode is an Indic-first AI application builder. The first workspace supports
English and Hindi. Create a project, choose its output language, describe an
app, and browse the files and generation history saved for that project.

## Run locally

Requires Docker with Compose v2.

```sh
cp .env.example .env
docker compose up --build --wait
```

Open http://127.0.0.1:8080. The API applies ordered SQL migrations on startup.
PostgreSQL data persists in the Compose volume. Use the same browser profile
to reopen your workspace. The default mock mode works offline after setup
and returns a localized starter template.

To switch to a real provider, set `AI_PROVIDER=compatible`, `AI_BASE_URL`
(the API root, including `/v1` where applicable), `AI_API_KEY`, and
`AI_MODEL` in `.env`. Recreate the API with `docker compose up -d api`.
The endpoint must support Chat Completions and return the JSON file format
requested by the adapter. Only the server reads the provider key.

## Development and tests

Use Node 22 and Python 3.12. The Vite development server proxies API calls to
port 8000. Run the API locally by setting `DATABASE_URL` to your development
PostgreSQL database and running `python -m db && uvicorn main:app --reload`
from `services/api` with the requirements installed.

```sh
cd apps/web
npm ci
npm test
npm run build
```

```sh
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check .
ruff format --check .
# Use a disposable PostgreSQL database. Integration tests truncate app tables.
TEST_DATABASE_URL=postgresql://user:password@localhost/lingocode_test pytest -q
```

CI runs those checks and exercises the Compose stack through the same HTTP
endpoint that the browser uses. Run the smoke test with `python3 infra/smoke.py`
after Compose starts.

See [deployment, threat model and data retention](docs/operations.md) before
deploying outside a local development machine.
