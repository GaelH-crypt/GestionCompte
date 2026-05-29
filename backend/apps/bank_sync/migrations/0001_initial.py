import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='GoCardlessToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('access_token', models.TextField()),
                ('access_expires', models.DateTimeField()),
                ('refresh_token', models.TextField()),
                ('refresh_expires', models.DateTimeField()),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'GoCardless Token',
            },
        ),
        migrations.CreateModel(
            name='BankRequisition',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('requisition_id', models.CharField(max_length=100, unique=True)),
                ('institution_id', models.CharField(max_length=100)),
                ('institution_name', models.CharField(max_length=200)),
                ('institution_logo', models.URLField(blank=True)),
                ('status', models.CharField(
                    choices=[
                        ('CR', 'Created'),
                        ('LN', 'Linked'),
                        ('EX', 'Expired'),
                        ('RJ', 'Rejected'),
                        ('UA', 'Undergoing authentication'),
                        ('GA', 'Granting access'),
                        ('SA', 'Selecting accounts'),
                    ],
                    default='CR',
                    max_length=2,
                )),
                ('redirect_url', models.TextField()),
                ('reference', models.CharField(max_length=100, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bank_requisitions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='BankAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('account_id', models.CharField(max_length=100, unique=True)),
                ('iban', models.CharField(blank=True, max_length=34)),
                ('name', models.CharField(max_length=200)),
                ('currency', models.CharField(default='EUR', max_length=3)),
                ('last_synced_at', models.DateTimeField(blank=True, null=True)),
                ('linked_account', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='bank_accounts',
                    to='accounts.account',
                )),
                ('requisition', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='bank_accounts',
                    to='bank_sync.bankrequisition',
                )),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='SyncLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('synced_at', models.DateTimeField(auto_now_add=True)),
                ('transactions_added', models.IntegerField(default=0)),
                ('status', models.CharField(
                    choices=[('success', 'Succès'), ('error', 'Erreur')],
                    max_length=10,
                )),
                ('error_message', models.TextField(blank=True)),
                ('bank_account', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sync_logs',
                    to='bank_sync.bankaccount',
                )),
            ],
            options={
                'ordering': ['-synced_at'],
            },
        ),
    ]
