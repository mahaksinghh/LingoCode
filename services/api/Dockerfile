FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY db.py main.py providers.py ./
COPY migrations ./migrations
USER 10001
CMD ["sh", "-c", "python -m db && exec uvicorn main:app --host 0.0.0.0 --port 8000"]
