# Generated with LingoCode

This application includes a React frontend, a FastAPI records API, and
PostgreSQL storage. Its fields, labels, theme, and plan are in
`web/src/spec.json`.

## Launch on your computer

```sh
docker compose up --build --wait
```

Open http://127.0.0.1:8090. Set `APP_PORT` in a local .env file to use a
different port. Records persist in the Compose volume.

## Deploy as a container

Build the included Dockerfile and deploy it with a PostgreSQL database.
Set `DATABASE_URL` and a strong `APP_PASSWORD` through your host's
secret configuration. Connect the service to port 8000 behind HTTPS
and configure a health check at `/api/health`. Sign in with username
`studio` and your configured password. This is a single shared workspace
for its operators. The local Compose deployment binds to loopback and
allows password-free development by default.

Review the application, validate real workloads and set up database backups
before serving customers. Exported source is independent of LingoCode.

## Publish a container from GitHub

Commit the exported directory to a GitHub repository. Run the included
**Build and publish container** workflow from Actions. It builds the
application and publishes the selected commit to GitHub Container Registry.
The image address appears in the run summary. Configure your container
host to pull the image, using read-only registry credentials if it is
private. Set the database URL and password on the container host.
