import json

import httpx
import pytest
from pydantic import ValidationError

import providers


@pytest.mark.parametrize("path", ["../index.html", "/index.html", "C:/main.py", "a//b"])
def test_rejects_invalid_paths(path):
    with pytest.raises(ValidationError):
        providers.GeneratedFile(path=path, content="")


def test_compatible_provider_sends_language_and_validates_result(monkeypatch):
    def respond(url, *, headers, json, timeout):
        assert url == "https://provider.example/v1/chat/completions"
        assert headers["Authorization"] == "Bearer test-key"
        assert json["model"] == "test-model"
        assert "Hindi" in json["messages"][0]["content"]
        assert json["messages"][1]["content"] == "नोट ऐप"
        assert timeout == 40
        return response

    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://provider.example/v1/chat/completions"),
        json={
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {"files": [{"path": "src/index.html", "content": "<h1>नोट्स</h1>"}]}
                        )
                    }
                }
            ]
        },
    )
    monkeypatch.setattr(providers.httpx, "post", respond)
    provider = providers.CompatibleProvider(
        "https://provider.example/v1/", "test-key", "test-model"
    )
    assert provider.generate("नोट ऐप", "hi").files[0].content == "<h1>नोट्स</h1>"
