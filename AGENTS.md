# LingoCode — Codex development instructions

Build LingoCode as an Indic-first multilingual AI application builder. Use Codex for all implementation work, with small reviewable pull requests.

## Initial architecture
- Frontend: React, TypeScript, Vite; accessible responsive UI.
- API: FastAPI (Python), typed request/response schemas.
- Persistence: PostgreSQL with migrations.
- AI: provider-agnostic adapter with server-side secrets and an explicit mock provider for local development.
- Execution: isolated sandbox service; never execute generated code in the API process.
- Future integration: VS Code extension after the core web workflow works.

## First vertical slice
1. Scaffold `apps/web`, `services/api`, `infra`, and documentation with reproducible local setup.
2. Add a project workspace UI with prompt entry, language selection, project list, and generated-file preview.
3. Implement API endpoints for projects and generation jobs, using persisted data.
4. Implement an AI provider interface and mock mode so end-to-end tests run without credentials.
5. Add automated frontend/backend tests, lint/type checks, and GitHub Actions CI.
6. Document threat model, data retention, deployment and secrets configuration.

## Engineering rules
- Never commit credentials or production secrets. Use `.env.example` files.
- Validate inputs and enforce per-user authorization before exposing project data.
- Do not claim generated code is safe to run without sandboxing and resource limits.
- Prefer simple, maintainable components and clear error states.
- Every PR should include a summary, tests run, and remaining limitations.
- Keep `main` stable; work on feature branches and open PRs for review.

## Product scope
Support natural-language requests in Hindi, English and other Indian languages through a locale-aware UI and AI orchestration. Do not imply that unsupported languages or deployment targets already work. Prioritize a functioning end-to-end MVP over placeholder features.
