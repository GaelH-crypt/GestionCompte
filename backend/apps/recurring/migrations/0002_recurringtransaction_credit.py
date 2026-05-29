from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('recurring', '0001_initial'),
        ('credits', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='recurringtransaction',
            name='credit',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='recurring_transactions',
                to='credits.credit',
            ),
        ),
    ]
