import json
import os
from dataclasses import dataclass
import re

from google import genai
from google.genai import types


MESS_THALI_PROMPT = """You are an expert fitness API analyzing a meal to track a 1,800 kcal limit and 100g protein goal.
CONTEXT FOR SCALING: This is served on a standard Indian mess stainless steel thali. Use the compartment sizes to estimate volume.
ADDITIONAL USER NOTES: {user_notes}
OPTIONAL RAW MEAL TEXT: {raw_input_text}

RULES:
- 1 standard Roti = ~100 kcal, 3g protein.
- 1 cup Dal = ~120 kcal, 6g protein.
- 1 cup Rice = ~130 kcal, 3g protein.
- 3 pc Chicken = ~250 kcal, 25g protein.
- Flag "is_high_sodium": true FOR deep-fried items (Bhatura, Puri), fast food (Pizza), and heavy gravies/Biryani.
- Flag "is_high_sugar": true FOR sweets or ice cream.

CRITICAL: Return ONLY a valid JSON object matching this schema exactly:
{{"calories": <integer>, "protein_g": <integer>, "carbs_g": <integer>, "fats_g": <integer>, "meal_summary": <string>, "is_high_sodium": <boolean>, "is_high_sugar": <boolean>}}

meal_summary must be a single line under 90 characters.

Do not include any markdown formatting, code blocks, or additional text. Return ONLY the JSON object.
"""

# JSON Schema for structured output
MEAL_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "calories": {
            "type": "integer",
            "description": "Estimated calories in the meal"
        },
        "protein_g": {
            "type": "integer",
            "description": "Estimated protein in grams"
        },
        "carbs_g": {
            "type": "integer",
            "description": "Estimated carbohydrates in grams"
        },
        "fats_g": {
            "type": "integer",
            "description": "Estimated fats in grams"
        },
        "meal_summary": {
            "type": "string",
            "description": "One-line meal summary for history (under 90 chars)"
        },
        "is_high_sodium": {
            "type": "boolean",
            "description": "Whether the meal is high in sodium"
        },
        "is_high_sugar": {
            "type": "boolean",
            "description": "Whether the meal is high in sugar"
        }
    },
    "required": ["calories", "protein_g", "carbs_g", "fats_g", "meal_summary", "is_high_sodium", "is_high_sugar"]
}


@dataclass(frozen=True)
class MealAnalysis:
    calories: int
    protein_g: int
    carbs_g: int
    fats_g: int
    meal_summary: str
    is_high_sodium: bool
    is_high_sugar: bool


def _normalize_key_string(s: str) -> str:
    s = (s or "").strip()
    s = s.replace('\\"', '"').replace("\\'", "'")
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    while len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        s = s[1:-1].strip()
    return s


def _get_required_field(data: dict, key: str):
    # Direct lookup
    if key in data:
        val = data[key]
        if val is not None:
            return val

    # Normalized lookup
    target = _normalize_key_string(key).lower()
    for k, v in data.items():
        nk = _normalize_key_string(str(k)).lower()
        if nk == target and v is not None:
            return v

    # Keyword fallback (handles unusual key names)
    for k, v in data.items():
        if v is None:
            continue
        nk = re.sub(r"[^a-z_]", "", _normalize_key_string(str(k)).lower())
        if key == "calories" and "calorie" in nk:
            return v
        if key == "protein_g" and "protein" in nk and "g" in nk:
            return v
        if key == "protein_g" and "protein" in nk:
            return v
        if key == "is_high_sodium" and "sodium" in nk and "high" in nk:
            return v
        if key == "is_high_sodium" and "sodium" in nk:
            return v
        if key == "is_high_sugar" and "sugar" in nk and "high" in nk:
            return v
        if key == "is_high_sugar" and "sugar" in nk:
            return v
        if key == "carbs_g" and ("carb" in nk or "carbo" in nk) and "g" in nk:
            return v
        if key == "carbs_g" and ("carb" in nk or "carbo" in nk):
            return v
        if key == "fats_g" and "fat" in nk and "g" in nk:
            return v
        if key == "fats_g" and "fat" in nk:
            return v
        if key == "meal_summary" and ("summary" in nk or "headline" in nk):
            return v

    # Not found - provide detailed error
    import sys
    print(f"[DEBUG] Field '{key}' not found. Available keys: {list(data.keys())}", file=sys.stderr)
    print(f"[DEBUG] Full data: {data}", file=sys.stderr)
    raise KeyError(f"'{key}'")



def _extract_json(text: str) -> dict:
    raw = (text or "").strip()
    
    # Remove markdown code block formatting
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    
    # Try to parse as JSON
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError as e:
        import sys
        print(f"[DEBUG] JSON parse failed on: {repr(raw)}", file=sys.stderr)
        print(f"[DEBUG] Error: {e}", file=sys.stderr)
        raise ValueError(f"Failed to parse Gemini response as JSON: {e}")
    
    # Handle case where JSON is wrapped in a string
    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except json.JSONDecodeError:
            pass

    if not isinstance(parsed, dict):
        raise ValueError(f"Gemini did not return a JSON object. Got type: {type(parsed).__name__}")

    def _norm_key(k: object) -> str:
        return _normalize_key_string(str(k))

    normalized = {_norm_key(k): v for k, v in parsed.items()}

    # Heuristic remap if Gemini returns weird/quoted keys
    expected = {"calories", "protein_g", "carbs_g", "fats_g", "meal_summary", "is_high_sodium", "is_high_sugar"}
    if not expected.issubset(set(normalized.keys())):
        remapped: dict[str, object] = {}
        for k, v in normalized.items():
            lk = re.sub(r"[^a-z_]", "", k.lower())
            if "calorie" in lk:
                remapped["calories"] = v
            elif "protein" in lk and "g" in lk:
                remapped["protein_g"] = v
            elif "protein" in lk:
                remapped["protein_g"] = v
            elif "carb" in lk:
                remapped["carbs_g"] = v
            elif "fat" in lk:
                remapped["fats_g"] = v
            elif "summary" in lk:
                remapped["meal_summary"] = v
            elif ("sodium" in lk or "salt" in lk) and "high" in lk:
                remapped["is_high_sodium"] = v
            elif ("sugar" in lk or "sweet" in lk) and "high" in lk:
                remapped["is_high_sugar"] = v
        
        # Merge remapped keys with normalized
        normalized = {**normalized, **remapped}

    import sys
    print(f"[DEBUG] Normalized keys after extraction: {list(normalized.keys())}", file=sys.stderr)
    
    return normalized


def analyze_meal_image(*, image_bytes: bytes, mime_type: str, user_notes: str, api_key: str) -> MealAnalysis:
    if not api_key:
        raise RuntimeError("Missing Gemini API key for user profile.")

    client = genai.Client(api_key=api_key)

    prompt = MESS_THALI_PROMPT.format(user_notes=user_notes or "", raw_input_text="")
    
    # Try with JSON schema first (preferred method)
    try:
        resp = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[
                prompt,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MEAL_ANALYSIS_SCHEMA,
            ),
        )
    except Exception as e:
        # Fallback to simple response_mime_type without schema
        import sys
        print(f"[DEBUG] First attempt failed: {e}", file=sys.stderr)
        resp = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[
                prompt,
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
    
    raw_text = resp.text or ""
    
    # Debug logging
    import sys
    print(f"[DEBUG] Raw response from Gemini: {repr(raw_text)}", file=sys.stderr)
    
    data = _extract_json(raw_text)
    
    print(f"[DEBUG] Extracted JSON data: {data}", file=sys.stderr)

    calories = int(_get_required_field(data, "calories"))
    protein_g = int(_get_required_field(data, "protein_g"))
    carbs_g = int(_get_required_field(data, "carbs_g"))
    fats_g = int(_get_required_field(data, "fats_g"))
    is_high_sodium = bool(_get_required_field(data, "is_high_sodium"))
    is_high_sugar = bool(_get_required_field(data, "is_high_sugar"))

    try:
        meal_summary = str(_get_required_field(data, "meal_summary")).strip()
    except KeyError:
        meal_summary = f"Meal estimate: {calories} kcal, P{protein_g} C{carbs_g} F{fats_g}"

    if not meal_summary:
        meal_summary = f"Meal estimate: {calories} kcal, P{protein_g} C{carbs_g} F{fats_g}"

    return MealAnalysis(
        calories=calories,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fats_g=fats_g,
        meal_summary=meal_summary[:140],
        is_high_sodium=is_high_sodium,
        is_high_sugar=is_high_sugar,
    )


def analyze_meal_text(*, raw_input_text: str, user_notes: str, api_key: str) -> MealAnalysis:
    if not api_key:
        raise RuntimeError("Missing Gemini API key for user profile.")

    meal_text = (raw_input_text or "").strip()
    if not meal_text:
        raise RuntimeError("Please provide meal text if no image is uploaded.")

    client = genai.Client(api_key=api_key)
    prompt = MESS_THALI_PROMPT.format(user_notes=user_notes or "", raw_input_text=meal_text)

    try:
        resp = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[prompt, f"MEAL TEXT INPUT: {meal_text}"],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=MEAL_ANALYSIS_SCHEMA,
            ),
        )
    except Exception:
        resp = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[prompt, f"MEAL TEXT INPUT: {meal_text}"],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    data = _extract_json(resp.text or "")

    calories = int(_get_required_field(data, "calories"))
    protein_g = int(_get_required_field(data, "protein_g"))
    carbs_g = int(_get_required_field(data, "carbs_g"))
    fats_g = int(_get_required_field(data, "fats_g"))
    is_high_sodium = bool(_get_required_field(data, "is_high_sodium"))
    is_high_sugar = bool(_get_required_field(data, "is_high_sugar"))

    try:
        meal_summary = str(_get_required_field(data, "meal_summary")).strip()
    except KeyError:
        meal_summary = f"Meal estimate: {calories} kcal, P{protein_g} C{carbs_g} F{fats_g}"

    if not meal_summary:
        meal_summary = f"Meal estimate: {calories} kcal, P{protein_g} C{carbs_g} F{fats_g}"

    return MealAnalysis(
        calories=calories,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fats_g=fats_g,
        meal_summary=meal_summary[:140],
        is_high_sodium=is_high_sodium,
        is_high_sugar=is_high_sugar,
    )

