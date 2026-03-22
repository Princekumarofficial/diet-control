from django.contrib import admin

from .models import CoachMessage, DailyLog, MealEntry, UserProfile


class MealEntryInline(admin.TabularInline):
	model = MealEntry
	extra = 0
	fields = (
		'timestamp',
		'meal_type',
		'meal_summary',
		'calories',
		'protein_g',
		'carbs_g',
		'fats_g',
		'is_high_sodium',
		'is_high_sugar',
	)
	readonly_fields = ('timestamp',)
	show_change_link = True


@admin.register(DailyLog)
class DailyLogAdmin(admin.ModelAdmin):
	date_hierarchy = 'date'
	list_display = (
		'date',
		'weight_kg',
		'steps_count',
		'water_ml',
		'total_calories_display',
		'total_protein_display',
		'total_carbs_display',
		'total_fats_display',
		'meal_count_display',
		'is_rest_day',
	)
	list_filter = (
		'is_rest_day',
		'apt_correctives_done',
		'took_multivitamin',
		'took_fish_oil',
		'date',
	)
	search_fields = ('planned_workout',)
	inlines = (MealEntryInline,)

	fieldsets = (
		('Day', {'fields': ('date', 'weight_kg')}),
		(
			'Activity & Posture',
			{'fields': ('steps_count', 'hours_seated', 'apt_correctives_done', 'water_ml')},
		),
		(
			'Gym & Recovery',
			{'fields': ('is_rest_day', 'planned_workout', 'soreness_profile')},
		),
		(
			'Supplements',
			{'fields': ('whey_scoops', 'creatine_g', 'took_multivitamin', 'took_fish_oil')},
		),
		(
			'Computed Totals',
			{
				'fields': (
					'total_calories_display',
					'total_protein_display',
					'total_carbs_display',
					'total_fats_display',
					'meal_count_display',
				)
			},
		),
	)
	readonly_fields = (
		'total_calories_display',
		'total_protein_display',
		'total_carbs_display',
		'total_fats_display',
		'meal_count_display',
	)

	@admin.display(description='Total Calories')
	def total_calories_display(self, obj: DailyLog):
		return obj.total_daily_calories

	@admin.display(description='Total Protein (g)')
	def total_protein_display(self, obj: DailyLog):
		return obj.total_daily_protein

	@admin.display(description='Total Carbs (g)')
	def total_carbs_display(self, obj: DailyLog):
		return obj.total_daily_carbs

	@admin.display(description='Total Fats (g)')
	def total_fats_display(self, obj: DailyLog):
		return obj.total_daily_fats

	@admin.display(description='Meals')
	def meal_count_display(self, obj: DailyLog):
		return obj.meals.count()


@admin.register(MealEntry)
class MealEntryAdmin(admin.ModelAdmin):
	date_hierarchy = 'timestamp'
	list_display = (
		'id',
		'timestamp',
		'daily_log',
		'meal_type',
		'meal_summary',
		'calories',
		'protein_g',
		'carbs_g',
		'fats_g',
		'is_high_sodium',
		'is_high_sugar',
	)
	list_filter = ('meal_type', 'is_high_sodium', 'is_high_sugar', 'daily_log__date')
	search_fields = ('meal_summary', 'raw_input_text', 'daily_log__date')
	autocomplete_fields = ('daily_log',)
	readonly_fields = ('timestamp',)


@admin.register(CoachMessage)
class CoachMessageAdmin(admin.ModelAdmin):
	date_hierarchy = 'created_at'
	list_display = ('created_at', 'role', 'short_content')
	list_filter = ('role', 'created_at')
	search_fields = ('content',)
	readonly_fields = ('created_at',)

	@admin.display(description='Content')
	def short_content(self, obj: CoachMessage):
		if len(obj.content) <= 120:
			return obj.content
		return f"{obj.content[:117]}..."


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
	list_display = (
		'id',
		'sex',
		'age_years',
		'height_cm',
		'body_fat_percent',
		'activity_level',
		'goal',
		'target_deficit_kcal',
		'updated_at',
	)
	list_filter = ('sex', 'activity_level', 'goal')
	readonly_fields = ('created_at', 'updated_at')
	fieldsets = (
		('Body Metrics', {'fields': ('sex', 'age_years', 'height_cm', 'body_fat_percent')}),
		('Planning', {'fields': ('activity_level', 'goal', 'target_deficit_kcal')}),
		('Metadata', {'fields': ('created_at', 'updated_at')}),
	)
