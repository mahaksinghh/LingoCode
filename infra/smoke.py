"""Exercise the built stack through the frontend reverse proxy."""
import json
import secrets
from urllib.request import Request, urlopen

BASE_URL = "http://127.0.0.1:8080"
KEY = secrets.token_hex(32)


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    with urlopen(Request(BASE_URL + path, data, headers), timeout=15) as response:
        return response.read()


assert b"LingoCode" in request("/")
assert json.loads(request("/api/health")) == {"status": "ok"}
project = json.loads(request("/api/projects", {"name": "नोट्स", "locale": "hi"}))
path = f"/api/projects/{project['id']}/generations"
result = json.loads(request(path, {"prompt": "नोट्स ऐप बनाएँ"}))
assert result["status"] == "succeeded"
assert result["files"][0]["path"] == "README.md"
assert "नोट्स ऐप बनाएँ" in result["files"][0]["content"]
assert json.loads(request(path)) == [result]
print("Compose smoke test passed")
