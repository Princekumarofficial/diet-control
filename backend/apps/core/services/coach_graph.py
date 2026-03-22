import json
from typing import Any, TypedDict

from django.contrib.auth import get_user_model
from django.utils import timezone
from google import genai
from google.genai import types
from langgraph.graph import END, START, StateGraph

from apps.core.models import CoachMessage, DailyLog
from apps.core.models import UserProfile
from apps.core.services.metabolism import calculate_daily_targets


COACH_SYSTEM_PROMPT = """You are Project Shred Coach, a practical personal fitness coach.
Your user goal: lose belly fat while preserving/building muscle.
Use only the provided user context data. Be specific and actionable.

Response style rules:
- Be supportive and direct.
- Keep response under 180 words.
- Include exactly 3 bullet action points.
- If relevant, mention calories/protein/carbs/fats/water/steps targets.
- Never invent medical diagnoses.
"""


class CoachState(TypedDict, total=False):
    user_id: int
    gemini_api_key: str
    user_message: str
    context_json: str
    reply: str


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _build_user_context(user) -> dict[str, Any]:
    today = timezone.localdate()
    log, _ = DailyLog.objects.get_or_create(user=user, date=today)
    profile = UserProfile.objects.filter(user=user).first() or UserProfile.objects.create(user=user)
    targets = calculate_daily_targets(profile=profile, log=log)

    recent_logs = list(DailyLog.objects.filter(user=user).order_by('-date')[:14])
    recent_meals = list(log.meals.order_by('-timestamp')[:8])

    avg_steps_7d = 0
    if recent_logs:
        last_7 = recent_logs[:7]
        avg_steps_7d = sum(l.steps_count for l in last_7) / max(1, len(last_7))

    history = list(CoachMessage.objects.filter(user=user).order_by('-created_at')[:8])
    history.reverse()

    return {
        'today': {
            'date': log.date.isoformat(),
            'weight_kg': _safe_float(log.weight_kg, 0.0) if log.weight_kg is not None else None,
            'calories': log.total_daily_calories,
            'protein_g': log.total_daily_protein,
            'carbs_g': log.total_daily_carbs,
            'fats_g': log.total_daily_fats,
            'water_ml': log.water_ml,
            'steps_count': log.steps_count,
            'soreness_profile': log.soreness_profile,
            'supplements': {
                'whey_scoops': log.whey_scoops,
                'creatine_g': log.creatine_g,
                'took_multivitamin': log.took_multivitamin,
                'took_fish_oil': log.took_fish_oil,
            },
        },
        'targets': {
            'calories_kcal': targets.calorie_target_kcal,
            'protein_g': targets.protein_target_g,
            'carbs_g': targets.carbs_target_g,
            'fats_g': targets.fats_target_g,
            'water_ml': 3000,
            'steps': 8000,
        },
        'recent_meals': [
            {
                'time': m.timestamp.isoformat(),
                'summary': m.meal_summary,
                'calories': m.calories,
                'protein_g': m.protein_g,
                'carbs_g': m.carbs_g,
                'fats_g': m.fats_g,
                'high_sodium': m.is_high_sodium,
                'high_sugar': m.is_high_sugar,
            }
            for m in recent_meals
        ],
        'trends': {
            'avg_steps_7d': round(avg_steps_7d, 0),
            'days_logged': len(recent_logs),
        },
        'chat_history': [{'role': m.role, 'content': m.content} for m in history],
    }


def _collect_context_node(state: CoachState) -> CoachState:
    user_id = state.get('user_id')
    if not user_id:
        raise RuntimeError('Missing user context for coach chat.')
    User = get_user_model()
    user = User.objects.get(id=user_id)
    context = _build_user_context(user)
    return {'context_json': json.dumps(context, default=str)}


def _coach_reply_node(state: CoachState) -> CoachState:
    api_key = (state.get('gemini_api_key') or '').strip()
    if not api_key:
        raise RuntimeError('Missing Gemini API key for user profile.')

    user_message = (state.get('user_message') or '').strip()
    context_json = state.get('context_json') or '{}'

    client = genai.Client(api_key=api_key)
    prompt = (
        f"{COACH_SYSTEM_PROMPT}\n\n"
        f"USER CONTEXT (JSON):\n{context_json}\n\n"
        f"USER MESSAGE:\n{user_message}\n"
    )

    resp = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[prompt],
        config=types.GenerateContentConfig(temperature=0.4),
    )
    reply = (resp.text or '').strip()
    if not reply:
        reply = 'You are on track. Keep protein high, stay under calories, and hydrate today.'

    return {'reply': reply}


def _finalize_node(state: CoachState) -> CoachState:
    reply = (state.get('reply') or '').strip()
    if len(reply) > 1200:
        reply = reply[:1200].rstrip() + '...'
    return {'reply': reply}


def _build_graph():
    graph = StateGraph(CoachState)
    graph.add_node('collect_context', _collect_context_node)
    graph.add_node('coach_reply', _coach_reply_node)
    graph.add_node('finalize', _finalize_node)

    graph.add_edge(START, 'collect_context')
    graph.add_edge('collect_context', 'coach_reply')
    graph.add_edge('coach_reply', 'finalize')
    graph.add_edge('finalize', END)
    return graph.compile()


COACH_GRAPH = _build_graph()


def run_coach_chat(*, user, user_message: str, gemini_api_key: str) -> dict[str, Any]:
    if not (user_message or '').strip():
        raise ValueError('Message is required.')

    state = COACH_GRAPH.invoke(
        {
            'user_id': user.id,
            'user_message': user_message,
            'gemini_api_key': gemini_api_key,
        }
    )
    reply = (state.get('reply') or '').strip()

    CoachMessage.objects.create(user=user, role=CoachMessage.ROLE_USER, content=user_message.strip())
    CoachMessage.objects.create(user=user, role=CoachMessage.ROLE_ASSISTANT, content=reply)

    return {'reply': reply}
