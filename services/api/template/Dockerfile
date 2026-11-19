FROM node:22-alpine AS frontend
WORKDIR /build
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api ./api
COPY web/src/spec.json ./spec.json
COPY --from=frontend /build/dist ./dist
USER 10001
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
