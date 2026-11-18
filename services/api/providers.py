import json
import os
from pathlib import PurePosixPath
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, Field, field_validator

Locale = Literal["en", "hi"]


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


class GenerationOutput(BaseModel):
    files: list[GeneratedFile] = Field(min_length=1, max_length=12)

    @field_validator("files")
    @classmethod
    def unique_paths(cls, files: list[GeneratedFile]) -> list[GeneratedFile]:
        if len({file.path for file in files}) != len(files):
            raise ValueError("File paths must be unique")
        return files


class Provider(Protocol):
    def generate(self, prompt: str, locale: Locale) -> GenerationOutput: ...


class MockProvider:
    def generate(self, prompt: str, locale: Locale) -> GenerationOutput:
        title, explanation = {
            "en": (
                "Starter application",
                "Mock mode returns the same starter structure for each prompt.",
            ),
            "hi": ("शुरुआती ऐप", "मॉक मोड हर अनुरोध के लिए एक जैसा शुरुआती ढाँचा देता है।"),
        }[locale]
        return GenerationOutput(
            files=[
                GeneratedFile(
                    path="README.md", content=f"# {title}\n\n{explanation}\n\n{prompt}\n"
                ),
                GeneratedFile(
                    path="index.html",
                    content=f'<!doctype html>\n<html lang="{locale}">\n'
                    f'<meta charset="utf-8">\n<title>{title}</title>\n<h1>{title}</h1>\n</html>\n',
                ),
            ]
        )


class CompatibleProvider:
    def __init__(self, base_url: str, key: str, model: str):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.key = key
        self.model = model

    def generate(self, prompt: str, locale: Locale) -> GenerationOutput:
        language = {"en": "English", "hi": "Hindi"}[locale]
        instructions = (
            f"Generate starter application files. Use {language} for human-facing text. "
            'Return only JSON of the form {"files":[{"path":"index.html","content":"..."}]}. '
            "Return up to 12 files with relative paths and at most 50000 characters each."
        )
        response = httpx.post(
            self.url,
            headers={"Authorization": f"Bearer {self.key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=40,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return GenerationOutput.model_validate(json.loads(content))


def configured_provider() -> Provider:
    mode = os.getenv("AI_PROVIDER", "mock")
    if mode == "mock":
        return MockProvider()
    if mode == "compatible":
        return CompatibleProvider(
            os.environ["AI_BASE_URL"], os.environ["AI_API_KEY"], os.environ["AI_MODEL"]
        )
    raise ValueError("Unsupported AI_PROVIDER")
