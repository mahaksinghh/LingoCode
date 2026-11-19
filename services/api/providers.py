import json
import os
from pathlib import PurePosixPath

import httpx
from pydantic import BaseModel, Field, field_validator


class GeneratedFile(BaseModel):
    path: str = Field(min_length=1, max_length=200)
    content: str = Field(max_length=50_000, pattern=r"^[^\x00]*$")

    @field_validator("path")
    @classmethod
    def relative_path(cls, value: str) -> str:
        if (
            any(ord(char) < 32 for char in value)
            or "\\" in value
            or ":" in value
            or set(value.split("/")) & {"", ".", ".."}
            or PurePosixPath(value).is_absolute()
        ):
            raise ValueError("Expected a relative file path")
        return value


class CompatibleProvider:
    def __init__(self, base_url: str, key: str, model: str):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.key = key
        self.model = model

    def complete(self, instructions: str, context: dict) -> object:
        response = httpx.post(
            self.url,
            headers={"Authorization": f"Bearer {self.key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
                ],
                "max_tokens": 2000,
            },
            timeout=40,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        if not isinstance(content, str) or len(content) > 20_000:
            raise ValueError("Invalid app specification response")
        content = content.strip()
        if content.startswith(("```json\n", "```\n")) and content.endswith("```"):
            content = content.split("\n", 1)[1][:-3].strip()
        return json.loads(content)


def provider_mode() -> str:
    mode = os.getenv("AI_PROVIDER", "mock")
    if mode not in {"mock", "compatible"}:
        raise ValueError("Unsupported AI_PROVIDER")
    return mode


def compatible_provider() -> CompatibleProvider:
    values = [os.environ.get(name, "") for name in ("AI_BASE_URL", "AI_API_KEY", "AI_MODEL")]
    if not all(values):
        raise ValueError("Configure AI_BASE_URL, AI_API_KEY and AI_MODEL")
    return CompatibleProvider(*values)
