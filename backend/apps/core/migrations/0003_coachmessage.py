from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_mealentry_carbs_g_meal_summary'),
    ]

    operations = [
        migrations.CreateModel(
            name='CoachMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('user', 'User'), ('assistant', 'Assistant')], max_length=20)),
                ('content', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
