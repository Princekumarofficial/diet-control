from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('core', '0001_initial'),
	]

	operations = [
		migrations.AddField(
			model_name='mealentry',
			name='carbs_g',
			field=models.IntegerField(default=0),
		),
		migrations.AddField(
			model_name='mealentry',
			name='meal_summary',
			field=models.CharField(blank=True, max_length=140),
		),
	]