from django.db import models
from django.utils import timezone


class DailyLog(models.Model):
    date = models.DateField(unique=True, default=timezone.now)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    # Activity & Posture
    steps_count = models.IntegerField(default=0)
    hours_seated = models.FloatField(default=0.0)
    apt_correctives_done = models.BooleanField(default=False)
    water_ml = models.IntegerField(default=0)

    # Gym & Recovery
    is_rest_day = models.BooleanField(default=False)
    planned_workout = models.CharField(max_length=50, blank=True)
    soreness_profile = models.JSONField(default=dict)  # e.g., {'chest': 8, 'legs': 2}

    # Supplements
    whey_scoops = models.FloatField(default=0.0)
    creatine_g = models.FloatField(default=0.0)
    took_multivitamin = models.BooleanField(default=False)
    took_fish_oil = models.BooleanField(default=False)

    @property
    def total_daily_calories(self):
        return sum(meal.calories for meal in self.meals.all())

    @property
    def total_daily_protein(self):
        return sum(meal.protein_g for meal in self.meals.all())

    @property
    def total_daily_carbs(self):
        return sum(meal.carbs_g for meal in self.meals.all())


class MealEntry(models.Model):
    daily_log = models.ForeignKey(DailyLog, related_name='meals', on_delete=models.CASCADE)
    timestamp = models.DateTimeField(auto_now_add=True)
    meal_type = models.CharField(max_length=20)

    raw_input_text = models.TextField(blank=True)

    # AI Extracted Data
    calories = models.IntegerField(default=0)
    protein_g = models.IntegerField(default=0)
    carbs_g = models.IntegerField(default=0)
    meal_summary = models.CharField(max_length=140, blank=True)
    is_high_sodium = models.BooleanField(default=False)
    is_high_sugar = models.BooleanField(default=False)


class CoachMessage(models.Model):
    ROLE_USER = 'user'
    ROLE_ASSISTANT = 'assistant'
    ROLE_CHOICES = (
        (ROLE_USER, 'User'),
        (ROLE_ASSISTANT, 'Assistant'),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class UserProfile(models.Model):
    SEX_MALE = 'male'
    SEX_FEMALE = 'female'
    SEX_OTHER = 'other'
    SEX_CHOICES = (
        (SEX_MALE, 'Male'),
        (SEX_FEMALE, 'Female'),
        (SEX_OTHER, 'Other'),
    )

    ACTIVITY_SEDENTARY = 'sedentary'
    ACTIVITY_LIGHT = 'light'
    ACTIVITY_MODERATE = 'moderate'
    ACTIVITY_ACTIVE = 'active'
    ACTIVITY_ATHLETE = 'athlete'
    ACTIVITY_CHOICES = (
        (ACTIVITY_SEDENTARY, 'Sedentary'),
        (ACTIVITY_LIGHT, 'Lightly Active'),
        (ACTIVITY_MODERATE, 'Moderately Active'),
        (ACTIVITY_ACTIVE, 'Very Active'),
        (ACTIVITY_ATHLETE, 'Athlete'),
    )

    GOAL_CUT = 'cut'
    GOAL_MAINTAIN = 'maintain'
    GOAL_GAIN = 'gain'
    GOAL_CHOICES = (
        (GOAL_CUT, 'Cut'),
        (GOAL_MAINTAIN, 'Maintain'),
        (GOAL_GAIN, 'Gain'),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    age_years = models.PositiveSmallIntegerField(default=22)
    sex = models.CharField(max_length=10, choices=SEX_CHOICES, default=SEX_MALE)
    height_cm = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    body_fat_percent = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    activity_level = models.CharField(max_length=12, choices=ACTIVITY_CHOICES, default=ACTIVITY_MODERATE)
    goal = models.CharField(max_length=10, choices=GOAL_CHOICES, default=GOAL_CUT)
    target_deficit_kcal = models.IntegerField(default=400)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"UserProfile #{self.id}"
