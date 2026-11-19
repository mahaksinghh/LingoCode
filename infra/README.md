# Infrastructure

The root Compose file runs PostgreSQL, the FastAPI studio, a background generation
worker, and Nginx for the web bundle and same-origin API routes. Only the web
service publishes a port, on loopback. The generated export has a separate
Dockerfile and Compose setup.

CI uses `smoke.py` to verify the Studio proxy and background worker. The Chromium
suite in `apps/web/e2e` verifies the Studio interface and builds and exercises a
downloaded ZIP on a separate PostgreSQL database.
