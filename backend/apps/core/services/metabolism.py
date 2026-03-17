from __future__ import annotations

from dataclasses import dataclass

from apps.core.models import DailyLog, UserProfile


ACTIVITY_MULTIPLIER = {
    UserProfile.ACTIVITY_SEDENTARY: 1.2,
    UserProfile.ACTIVITY_LIGHT: 1.35,
    UserProfile.ACTIVITY_MODERATE: 1.5,
    UserProfile.ACTIVITY_ACTIVE: 1.65,
    UserProfile.ACTIVITY_ATHLETE: 1.8,
}


@dataclass(frozen=True)
class DailyTargets:
    bmr_kcal: int
    calories_burned_estimate: int
    calorie_target_kcal: int
    protein_target_g: int


def _mifflin_bmr(*, sex: str, weight_kg: float, height_cm: float, age_years: int) -> float:
    base = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age_years)
    if sex == UserProfile.SEX_FEMALE:
        return base - 161.0
    if sex == UserProfile.SEX_MALE:
        return base + 5.0
    return base - 78.0


def _katch_bmr(*, weight_kg: float, body_fat_percent: float) -> float:
    lean_mass_kg = max(0.0, weight_kg * (1.0 - (body_fat_percent / 100.0)))
    return 370.0 + (21.6 * lean_mass_kg)


def calculate_daily_targets(*, profile: UserProfile, log: DailyLog) -> DailyTargets:
    weight = float(log.weight_kg) if log.weight_kg is not None else None
    height = float(profile.height_cm) if profile.height_cm is not None else None
    body_fat = float(profile.body_fat_percent) if profile.body_fat_percent is not None else None

    if weight and body_fat is not None and 2.0 <= body_fat <= 60.0:
        bmr = _katch_bmr(weight_kg=weight, body_fat_percent=body_fat)
    elif weight and height and profile.age_years:
        bmr = _mifflin_bmr(
            sex=profile.sex,
            weight_kg=weight,
            height_cm=height,
            age_years=int(profile.age_years),
        )
    else:
        bmr = 1750.0

    activity_multiplier = ACTIVITY_MULTIPLIER.get(profile.activity_level, 1.5)
    baseline_burn = bmr * activity_multiplier

    # Assume baseline includes around 5k steps/day; only add extra movement above baseline.
    extra_steps = max(0, int(log.steps_count or 0) - 5000)
    step_burn = extra_steps * 0.04

    workout_burn = 0.0 if log.is_rest_day else (120.0 if str(log.planned_workout or '').strip() else 60.0)
    seated_penalty = max(0.0, float(log.hours_seated or 0.0) - 8.0) * 8.0

    calories_burned_estimate = int(max(1200.0, round(baseline_burn + step_burn + workout_burn - seated_penalty)))

    if profile.goal == UserProfile.GOAL_GAIN:
        calorie_target_kcal = calories_burned_estimate + 250
    elif profile.goal == UserProfile.GOAL_MAINTAIN:
        calorie_target_kcal = calories_burned_estimate
    else:
        deficit = max(250, min(int(profile.target_deficit_kcal or 400), 800))
        calorie_target_kcal = max(1200, calories_burned_estimate - deficit)

    if weight:
        protein_factor = 1.8 if profile.goal == UserProfile.GOAL_CUT else 1.6
        protein_target_g = int(round(max(90.0, weight * protein_factor)))
    else:
        protein_target_g = 100

    return DailyTargets(
        bmr_kcal=int(round(bmr)),
        calories_burned_estimate=calories_burned_estimate,
        calorie_target_kcal=int(round(calorie_target_kcal)),
        protein_target_g=protein_target_g,
    )
