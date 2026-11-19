import json
import re
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

from providers import GeneratedFile

Locale = Literal["en", "hi", "ta", "bn"]
Action = Literal["plan", "build", "revise", "debug"]
LANGUAGES = {"en": "English", "hi": "Hindi", "ta": "Tamil", "bn": "Bengali"}
TEMPLATE = Path(__file__).with_name("template")


def text_limit(max_length: int):
    return StringConstraints(
        strip_whitespace=True, min_length=1, max_length=max_length, pattern=r"^[^\x00]*$"
    )


class AppField(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,23}$")
    label: Annotated[str, text_limit(60)]
    kind: Literal["text", "number", "boolean"]


class AppSpec(BaseModel):
    title: Annotated[str, text_limit(100)]
    description: Annotated[str, text_limit(400)]
    accent: Literal["mint", "indigo", "rose", "amber"]
    fields: list[AppField] = Field(min_length=1, max_length=6)
    steps: list[Annotated[str, text_limit(300)]] = Field(min_length=2, max_length=6)

    @field_validator("fields")
    @classmethod
    def unique_fields(cls, fields: list[AppField]) -> list[AppField]:
        keys = {field.key for field in fields}
        if len(keys) != len(fields) or keys & {"constructor", "prototype"}:
            raise ValueError("Expected unique field keys")
        if not any(field.kind == "text" for field in fields):
            raise ValueError("Include at least one text field")
        return fields


STARTER_TEXT = {
    "en": (
        "Name",
        "Details",
        "Done",
        "Quantity",
        "Manage records in one place.",
        "Define the records and their fields.",
        "Create, edit and remove records from the dashboard.",
        "Review the field labels and try the form with a sample record.",
    ),
    "hi": (
        "नाम",
        "विवरण",
        "पूरा",
        "मात्रा",
        "सभी रिकॉर्ड एक जगह प्रबंधित करें।",
        "रिकॉर्ड और उनके फ़ील्ड तय करें।",
        "डैशबोर्ड से रिकॉर्ड जोड़ें, बदलें और हटाएँ।",
        "फ़ील्ड के नाम जाँचें और फ़ॉर्म में एक नमूना रिकॉर्ड आज़माएँ।",
    ),
    "ta": (
        "பெயர்",
        "விவரம்",
        "முடிந்தது",
        "அளவு",
        "பதிவுகளை ஒரே இடத்தில் நிர்வகிக்கவும்.",
        "பதிவுகளுக்கான புலங்களைத் தேர்வுசெய்யவும்.",
        "பதிவுகளைச் சேர்க்கவும், திருத்தவும், நீக்கவும்.",
        "புலப் பெயர்களைச் சரிபார்த்து மாதிரிப் பதிவைச் சேர்க்கவும்.",
    ),
    "bn": (
        "নাম",
        "বিবরণ",
        "সম্পন্ন",
        "পরিমাণ",
        "এক জায়গায় রেকর্ড পরিচালনা করুন।",
        "রেকর্ড ও তার ক্ষেত্র নির্ধারণ করুন।",
        "ড্যাশবোর্ড থেকে রেকর্ড যোগ, সম্পাদনা ও মুছুন।",
        "ক্ষেত্রের নাম যাচাই করুন ও একটি নমুনা রেকর্ড দিয়ে ফর্মটি পরীক্ষা করুন।",
    ),
}
ACCENTS = {
    "mint": ("मिंट", "புதினா", "মিন্ট"),
    "indigo": ("इंडिगो", "இண்டிகோ", "ইন্ডিগো"),
    "rose": ("गुलाबी", "இளஞ்சிவப்பு", "গোলাপি"),
    "amber": ("अंबर", "அம்பர்", "অ্যাম্বার"),
}


def demo_spec(name: str, prompt: str, locale: Locale, action: Action, source: AppSpec | None):
    label, detail, done, quantity, description, first, second, diagnosis = STARTER_TEXT[locale]
    if source and action == "build":
        return source

    fields = (
        source.fields.copy()
        if source
        else [
            AppField(key="name", label=label, kind="text"),
            AppField(key="details", label=detail, kind="text"),
        ]
    )
    text = prompt.lower()
    additions = (
        ("done", done, "boolean", ("task", "todo", "टास्क", "कार्य", "பணி", "কাজ")),
        (
            "quantity",
            quantity,
            "number",
            (
                "inventory",
                "quantity",
                "stock",
                "मात्रा",
                "स्टॉक",
                "அளவு",
                "পরিমাণ",
            ),
        ),
    )
    for key, label, kind, keywords in additions:
        if (
            len(fields) < 6
            and any(word in text for word in keywords)
            and all(field.key != key for field in fields)
        ):
            fields.append(AppField(key=key, label=label, kind=kind))
    accent = next(
        (
            color
            for color, synonyms in ACCENTS.items()
            if re.search(rf"\b{color}\b", text) or any(word in text for word in synonyms)
        ),
        None,
    )
    return AppSpec(
        title=source.title if source else name,
        description=source.description if source else description,
        accent=accent or (source.accent if source else "mint"),
        fields=fields,
        steps=[first, diagnosis if action == "debug" else second],
    )


def build_files(spec: AppSpec, locale: Locale) -> list[GeneratedFile]:
    files = [
        GeneratedFile(path=path.relative_to(TEMPLATE).as_posix(), content=path.read_text())
        for path in sorted(TEMPLATE.rglob("*"))
        if path.is_file()
        and not any(part in {"__pycache__", "dist", "node_modules"} for part in path.parts)
    ]
    definition = {"locale": locale, **spec.model_dump()}
    files.append(
        GeneratedFile(
            path="web/src/spec.json",
            content=json.dumps(definition, ensure_ascii=False, indent=2) + "\n",
        )
    )
    return files
