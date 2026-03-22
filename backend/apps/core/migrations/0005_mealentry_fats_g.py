from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_userprofile'),
    ]

    operations = [
        migrations.AddField(
            model_name='mealentry',
            name='fats_g',
            field=models.IntegerField(default=0),
        ),
    ]
