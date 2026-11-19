"""Check the reverse proxy and worker, using the same account API as the browser."""

import json
import os
import secrets
from time import monotonic, sleep
from urllib.request import Request, urlopen

BASE_URL = os.getenv("STUDIO_URL", "http://127.0.0.1:8080")
TOKEN = ""


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    with urlopen(Request(BASE_URL + path, data, headers), timeout=15) as response:
        return response.read()


assert b"LingoCode" in request("/")
assert json.loads(request("/api/health")) == {"status": "ok"}
session = json.loads(request("/api/auth/register", {
    "email": f"smoke-{secrets.token_hex(8)}@example.test",
    "password": secrets.token_hex(16),
}))
TOKEN = session["token"]
project = json.loads(request("/api/projects", {"name": "নোট", "locale": "bn"}))
path = f"/api/projects/{project['id']}/generations"
queued = json.loads(request(path, {"prompt": "নোটের তালিকা", "action": "build"}))
assert queued["status"] == "queued"
job_path = f"{path}/{queued['id']}"
deadline = monotonic() + 30
while monotonic() < deadline:
    result = json.loads(request(job_path))
    if result["status"] in {"succeeded", "failed"}:
        break
    sleep(0.35)
assert result["status"] == "succeeded"
assert result["spec"]["fields"][0]["label"] == "নাম"
assert request(job_path + "/export").startswith(b"PK")
print("Studio reverse proxy, account, worker and ZIP passed.")
