from django.db import models
from django.contrib.auth.models import User
from apps.accounts.models import Account


class GoCardlessToken(models.Model):
    """Application-level token singleton (always pk=1)."""
    access_token = models.TextField()
    access_expires = models.DateTimeField()
    refresh_token = models.TextField()
    refresh_expires = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'GoCardless Token'

    def __str__(self):
        return f'GoCardless Token (expires {self.access_expires})'


class BankRequisition(models.Model):
    STATUS_CHOICES = [
        ('CR', 'Created'),
        ('LN', 'Linked'),
        ('EX', 'Expired'),
        ('RJ', 'Rejected'),
        ('UA', 'Undergoing authentication'),
        ('GA', 'Granting access'),
        ('SA', 'Selecting accounts'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bank_requisitions')
    requisition_id = models.CharField(max_length=100, unique=True)
    institution_id = models.CharField(max_length=100)
    institution_name = models.CharField(max_length=200)
    institution_logo = models.URLField(blank=True)
    status = models.CharField(max_length=2, choices=STATUS_CHOICES, default='CR')
    redirect_url = models.TextField()
    reference = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.institution_name} ({self.get_status_display()}) — {self.user}'


class BankAccount(models.Model):
    requisition = models.ForeignKey(BankRequisition, on_delete=models.CASCADE, related_name='bank_accounts')
    account_id = models.CharField(max_length=100, unique=True)
    iban = models.CharField(max_length=34, blank=True)
    name = models.CharField(max_length=200)
    currency = models.CharField(max_length=3, default='EUR')
    last_synced_at = models.DateTimeField(null=True, blank=True)
    linked_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_accounts',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.iban or self.account_id})'


class SyncLog(models.Model):
    STATUS_CHOICES = [
        ('success', 'Succès'),
        ('error', 'Erreur'),
    ]

    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='sync_logs')
    synced_at = models.DateTimeField(auto_now_add=True)
    transactions_added = models.IntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-synced_at']

    def __str__(self):
        return f'{self.bank_account} — {self.status} ({self.synced_at})'
