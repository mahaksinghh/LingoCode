# Infrastructure

The root Compose file runs PostgreSQL, FastAPI and the built web app. Nginx
serves the frontend and proxies same-origin API requests. Only the web port
is published, on loopback.
