import os

from google import genai
from google.genai import types


BODY_FAT_PROMPT = """Estimate body fat percentage from this physique image.

Output must be strict JSON only:
{"body_fat_percent": <number between 3 and 60>}

No markdown, no explanation, no additional keys.
"""


def estimate_body_fat_percent(*, image_bytes: bytes, mime_type: str) -> float:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY in environment.")

    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            BODY_FAT_PROMPT,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Could not estimate body fat from image.")

    import json

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Failed to parse body fat estimate response.") from exc

    value = float(data.get("body_fat_percent"))
    if value < 3 or value > 60:
        raise RuntimeError("Body fat estimate out of expected range.")
    return round(value, 1)
