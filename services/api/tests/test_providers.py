import json

import httpx
import pytest
from pydantic import ValidationError

from providers import GeneratedFile
from studio import AppSpec, demo_spec
from worker import generate_spec


@pytest.mark.parametrize("path", ["../index.html", "/index.html", "C:/main.py", "a//b"])
def test_rejects_invalid_paths(path):
    with pytest.raises(ValidationError):
        GeneratedFile(path=path, content="")


def test_compatible_provider_validates_a_localized_spec(monkeypatch):
    definition = {
        "title": "সামগ্রী",
        "description": "গুদামের হিসাব",
        "accent": "amber",
        "fields": [{"key": "name", "label": "নাম", "kind": "text"}],
        "steps": ["তালিকা দেখুন", "নতুন রেকর্ড যোগ করুন"],
    }

    def respond(url, *, headers, json: dict, timeout):
        assert url == "https://provider.example/v1/chat/completions"
        assert headers["Authorization"] == "Bearer test-key"
        assert json["model"] == "test-model"
        assert "Bengali" in json["messages"][1]["content"]
        assert timeout == 40
        return response

    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://provider.example/v1/chat/completions"),
        json={"choices": [{"message": {"content": json.dumps(definition)}}]},
    )
    monkeypatch.setattr(httpx, "post", respond)
    monkeypatch.setenv("AI_BASE_URL", "https://provider.example/v1")
    monkeypatch.setenv("AI_API_KEY", "test-key")
    monkeypatch.setenv("AI_MODEL", "test-model")
    result = generate_spec(
        {
            "provider": "compatible",
            "name": "Inventory",
            "prompt": "গুদাম",
            "locale": "bn",
            "action": "plan",
            "source": None,
        }
    )
    assert result == AppSpec.model_validate(definition)


@pytest.mark.parametrize(
    ("locale", "word", "label"),
    [
        ("en", "inventory", "Quantity"),
        ("hi", "मात्रा", "मात्रा"),
        ("ta", "அளவு", "அளவு"),
        ("bn", "পরিমাণ", "পরিমাণ"),
    ],
)
def test_template_locale(locale, word, label):
    assert demo_spec("Test", word, locale, "plan", None).fields[-1].label == label
