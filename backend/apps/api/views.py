from datetime import timedelta
from django.core.paginator import Paginator

from django.utils import timezone
from django.conf import settings
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import CoachMessage, DailyLog, MealEntry, UserProfile
from apps.core.services.coach_graph import run_coach_chat
from apps.core.services.gemini_body import estimate_body_fat_percent
from apps.core.services.gemini_meal import analyze_meal_image, analyze_meal_text
from apps.core.services.metabolism import calculate_daily_targets


DEFAULT_WATER_GOAL_ML = 3000
HIGH_SODIUM_WATER_GOAL_ML = 4000
DEFAULT_STEP_GOAL = 8000
CALORIE_OVERAGE_STEP_GOAL = 10000


def _get_profile() -> UserProfile:
    profile = UserProfile.objects.order_by('id').first()
    if profile:
        return profile
    return UserProfile.objects.create()


def _profile_payload(profile: UserProfile):
    return {
        "id": profile.id,
        "sex": profile.sex,
        "age_years": profile.age_years,
        "height_cm": float(profile.height_cm) if profile.height_cm is not None else None,
        "body_fat_percent": float(profile.body_fat_percent) if profile.body_fat_percent is not None else None,
        "activity_level": profile.activity_level,
        "goal": profile.goal,
        "target_deficit_kcal": profile.target_deficit_kcal,
    }


def _targets_payload(profile: UserProfile, log: DailyLog):
    targets = calculate_daily_targets(profile=profile, log=log)
    return {
        "bmr_kcal": targets.bmr_kcal,
        "calories_burned_estimate": targets.calories_burned_estimate,
        "calorie_target_kcal": targets.calorie_target_kcal,
        "protein_target_g": targets.protein_target_g,
        "carbs_target_g": targets.carbs_target_g,
        "fats_target_g": targets.fats_target_g,
    }


def _daily_log_payload(log: DailyLog):
    return {
        "date": log.date.isoformat(),
        "weight_kg": str(log.weight_kg) if log.weight_kg is not None else None,
        "steps_count": log.steps_count,
        "hours_seated": log.hours_seated,
        "apt_correctives_done": log.apt_correctives_done,
        "water_ml": log.water_ml,
        "is_rest_day": log.is_rest_day,
        "planned_workout": log.planned_workout,
        "soreness_profile": log.soreness_profile,
        "whey_scoops": log.whey_scoops,
        "creatine_g": log.creatine_g,
        "took_multivitamin": log.took_multivitamin,
        "took_fish_oil": log.took_fish_oil,
        "total_daily_calories": log.total_daily_calories,
        "total_daily_protein": log.total_daily_protein,
        "total_daily_carbs": log.total_daily_carbs,
        "total_daily_fats": log.total_daily_fats,
    }


def _damage_control_payload(*, calorie_limit: int, now_dt=None):
    """
    Recalculate next-24h corrective targets based on recent meals.
    """
    now_dt = now_dt or timezone.now()
    since = now_dt - timedelta(hours=24)
    recent_meals = MealEntry.objects.filter(timestamp__gte=since, timestamp__lte=now_dt)

    calories_24h = sum(meal.calories for meal in recent_meals)
    has_high_sodium = any(meal.is_high_sodium for meal in recent_meals)
    has_high_sugar = any(meal.is_high_sugar for meal in recent_meals)

    water_goal_ml = HIGH_SODIUM_WATER_GOAL_ML if has_high_sodium else DEFAULT_WATER_GOAL_ML
    step_goal = CALORIE_OVERAGE_STEP_GOAL if calories_24h > calorie_limit else DEFAULT_STEP_GOAL
    skip_carbs_next_meal = calories_24h > calorie_limit or has_high_sugar

    action_cards = []
    if has_high_sodium:
        action_cards.append(
            {
                "type": "high_sodium",
                "title": "High Sodium Trigger",
                "message": "Hydration target raised to 4L for the next 24 hours.",
            }
        )

    if calories_24h > calorie_limit:
        action_cards.append(
            {
                "type": "calorie_overage",
                "title": "Calorie Overage Trigger",
                "message": "Step goal raised to 10,000 and consider skipping carbs in next meal.",
            }
        )

    if has_high_sugar:
        action_cards.append(
            {
                "type": "high_sugar",
                "title": "High Sugar Trigger",
                "message": "Keep next meal low glycemic and avoid sweets.",
            }
        )

    if not action_cards:
        action_cards.append(
            {
                "type": "on_track",
                "title": "On Track",
                "message": "No damage control needed right now.",
            }
        )

    return {
        "window_hours": 24,
        "calories_24h": calories_24h,
        "flags": {
            "has_high_sodium": has_high_sodium,
            "has_high_sugar": has_high_sugar,
            "calorie_overage": calories_24h > calorie_limit,
        },
        "targets": {
            "water_goal_ml": water_goal_ml,
            "steps_goal": step_goal,
            "skip_carbs_next_meal": skip_carbs_next_meal,
        },
        "action_cards": action_cards,
    }


class DashboardTodayView(APIView):
    def get(self, request):
        today = timezone.localdate()
        log, _created = DailyLog.objects.get_or_create(date=today)
        profile = _get_profile()
        targets = _targets_payload(profile, log)
        return Response(
            {
                "status": "success",
                "daily_log": _daily_log_payload(log),
                "profile": _profile_payload(profile),
                "targets": targets,
                "damage_control": _damage_control_payload(calorie_limit=targets["calorie_target_kcal"]),
            }
        )


class MealAnalyzeView(APIView):
    def post(self, request):
        try:
            today = timezone.localdate()
            log, _created = DailyLog.objects.get_or_create(date=today)
            profile = _get_profile()

            uploaded = request.FILES.get("image")
            raw_input_text = str(request.data.get("raw_input_text") or "")
            user_notes = str(request.data.get("user_notes") or raw_input_text or "")

            if uploaded is None and not raw_input_text.strip():
                return Response(
                    {"status": "error", "message": "Provide either an image or meal text."},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

            if uploaded is not None:
                analysis = analyze_meal_image(
                    image_bytes=uploaded.read(),
                    mime_type=getattr(uploaded, "content_type", "image/jpeg") or "image/jpeg",
                    user_notes=user_notes,
                )
            else:
                analysis = analyze_meal_text(
                    raw_input_text=raw_input_text,
                    user_notes=user_notes,
                )

            meal = log.meals.create(
                meal_type=str(request.data.get("meal_type") or "meal"),
                raw_input_text=raw_input_text,
                calories=analysis.calories,
                protein_g=analysis.protein_g,
                carbs_g=analysis.carbs_g,
                fats_g=analysis.fats_g,
                meal_summary=analysis.meal_summary,
                is_high_sodium=analysis.is_high_sodium,
                is_high_sugar=analysis.is_high_sugar,
            )

            return Response(
                {
                    "status": "success",
                    "meal": {
                        "id": meal.id,
                        "calories": meal.calories,
                        "protein_g": meal.protein_g,
                        "carbs_g": meal.carbs_g,
                        "fats_g": meal.fats_g,
                        "meal_summary": meal.meal_summary,
                        "is_high_sodium": meal.is_high_sodium,
                        "is_high_sugar": meal.is_high_sugar,
                    },
                    "daily_log": _daily_log_payload(log),
                    "targets": _targets_payload(profile, log),
                    "damage_control": _damage_control_payload(
                        calorie_limit=calculate_daily_targets(profile=profile, log=log).calorie_target_kcal
                    ),
                }
            )
        except KeyError as e:
            return Response(
                {
                    "status": "error",
                    "message": f"Gemini response missing expected field: {str(e)}"
                    if settings.DEBUG
                    else "Gemini response missing expected field.",
                },
                status=http_status.HTTP_502_BAD_GATEWAY,
            )
        except RuntimeError as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DailyLogUpdateView(APIView):
    def patch(self, request, date):
        log, _created = DailyLog.objects.get_or_create(date=date)
        profile = _get_profile()

        editable_fields = {
            "weight_kg",
            "steps_count",
            "hours_seated",
            "apt_correctives_done",
            "water_ml",
            "is_rest_day",
            "planned_workout",
            "soreness_profile",
            "whey_scoops",
            "creatine_g",
            "took_multivitamin",
            "took_fish_oil",
        }

        for key, value in request.data.items():
            if key in editable_fields:
                setattr(log, key, value)

        log.save()
        return Response(
            {
                "status": "success",
                "daily_log": _daily_log_payload(log),
                "targets": _targets_payload(profile, log),
                "damage_control": _damage_control_payload(
                    calorie_limit=calculate_daily_targets(profile=profile, log=log).calorie_target_kcal
                ),
            }
        )


class WeeklyChartsView(APIView):
    def get(self, request):
        days = int(request.query_params.get("days", 7) or 7)
        days = max(1, min(days, 90))

        today = timezone.localdate()
        start = today - timedelta(days=days - 1)

        logs_by_date = {l.date: l for l in DailyLog.objects.filter(date__range=(start, today))}
        data = []
        for i in range(days):
            d = start + timedelta(days=i)
            log = logs_by_date.get(d)
            data.append(
                {
                    "date": d.isoformat(),
                    "calories": log.total_daily_calories if log else 0,
                    "protein_g": log.total_daily_protein if log else 0,
                    "carbs_g": log.total_daily_carbs if log else 0,
                    "fats_g": log.total_daily_fats if log else 0,
                    "weight_kg": float(log.weight_kg) if (log and log.weight_kg is not None) else None,
                }
            )

        return Response({"status": "success", "days": data})


class MealHistoryView(APIView):
    def get(self, request):
        page = int(request.query_params.get("page", 1) or 1)
        page_size = int(request.query_params.get("page_size", 15) or 15)
        page_size = max(1, min(page_size, 50))

        meals_qs = MealEntry.objects.select_related("daily_log").order_by("-timestamp")
        paginator = Paginator(meals_qs, page_size)

        if page > paginator.num_pages and paginator.num_pages > 0:
            return Response(
                {
                    "status": "success",
                    "count": paginator.count,
                    "page": page,
                    "page_size": page_size,
                    "has_next": False,
                    "results": [],
                }
            )

        page_obj = paginator.get_page(page)
        results = [
            {
                "id": meal.id,
                "timestamp": meal.timestamp.isoformat(),
                "date": meal.daily_log.date.isoformat(),
                "meal_type": meal.meal_type,
                "raw_input_text": meal.raw_input_text,
                "calories": meal.calories,
                "protein_g": meal.protein_g,
                "carbs_g": meal.carbs_g,
                "fats_g": meal.fats_g,
                "meal_summary": meal.meal_summary,
                "is_high_sodium": meal.is_high_sodium,
                "is_high_sugar": meal.is_high_sugar,
            }
            for meal in page_obj.object_list
        ]

        return Response(
            {
                "status": "success",
                "count": paginator.count,
                "page": page,
                "page_size": page_size,
                "has_next": page_obj.has_next(),
                "results": results,
            }
        )


class MealDeleteView(APIView):
    def delete(self, request, meal_id):
        try:
            meal = MealEntry.objects.select_related("daily_log").get(id=meal_id)
        except MealEntry.DoesNotExist:
            return Response(
                {"status": "error", "message": "Meal not found."},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        log = meal.daily_log
        meal.delete()
        profile = _get_profile()

        return Response(
            {
                "status": "success",
                "message": "Meal deleted.",
                "daily_log": _daily_log_payload(log),
                "targets": _targets_payload(profile, log),
                "damage_control": _damage_control_payload(
                    calorie_limit=calculate_daily_targets(profile=profile, log=log).calorie_target_kcal
                ),
            }
        )


class UserProfileView(APIView):
    def get(self, request):
        profile = _get_profile()
        today = timezone.localdate()
        log, _created = DailyLog.objects.get_or_create(date=today)
        return Response(
            {
                "status": "success",
                "profile": _profile_payload(profile),
                "targets": _targets_payload(profile, log),
            }
        )

    def patch(self, request):
        profile = _get_profile()
        editable_fields = {
            "sex",
            "age_years",
            "height_cm",
            "body_fat_percent",
            "activity_level",
            "goal",
            "target_deficit_kcal",
        }

        for key, value in request.data.items():
            if key not in editable_fields:
                continue
            if key in {"height_cm", "body_fat_percent"} and (value is None or str(value).strip() == ""):
                value = None
            setattr(profile, key, value)

        profile.save()

        today = timezone.localdate()
        log, _created = DailyLog.objects.get_or_create(date=today)
        return Response(
            {
                "status": "success",
                "profile": _profile_payload(profile),
                "targets": _targets_payload(profile, log),
            }
        )


class ProfileBodyFatEstimateView(APIView):
    def post(self, request):
        uploaded = request.FILES.get("image")
        if uploaded is None:
            return Response(
                {"status": "error", "message": "Body image is required."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        try:
            estimated = estimate_body_fat_percent(
                image_bytes=uploaded.read(),
                mime_type=getattr(uploaded, "content_type", "image/jpeg") or "image/jpeg",
            )
            profile = _get_profile()
            profile.body_fat_percent = estimated
            profile.save(update_fields=["body_fat_percent", "updated_at"])

            return Response(
                {
                    "status": "success",
                    "body_fat_percent": estimated,
                    "profile": _profile_payload(profile),
                }
            )
        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=http_status.HTTP_400_BAD_REQUEST,
            )


class CoachChatView(APIView):
    def post(self, request):
        message = str(request.data.get("message") or "").strip()
        if not message:
            return Response(
                {"status": "error", "message": "Message is required."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = run_coach_chat(message)
            return Response({"status": "success", "reply": result["reply"]})
        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CoachHistoryView(APIView):
    def get(self, request):
        limit = int(request.query_params.get("limit", 40) or 40)
        limit = max(1, min(limit, 100))

        messages = list(CoachMessage.objects.order_by("-created_at")[:limit])
        messages.reverse()

        return Response(
            {
                "status": "success",
                "messages": [
                    {
                        "id": m.id,
                        "role": m.role,
                        "content": m.content,
                        "created_at": m.created_at.isoformat(),
                    }
                    for m in messages
                ],
            }
        )
