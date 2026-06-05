from django.db import models
from django.contrib.auth.models import User
from apps.accounts.models import Account
from apps.categories.models import Category


class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('income', 'Revenu'),
        ('expense', 'Dépense'),
        ('transfer', 'Virement'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255)
    date = models.DateField()
    is_recurring = models.BooleanField(default=False)
    note = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    transfer_to_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True, related_name='incoming_transfers'
    )
    external_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    recurring_transaction = models.ForeignKey(
        'recurring.RecurringTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='linked_transactions',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['account', 'date'], name='tx_account_date_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                condition=models.Q(external_id__isnull=False),
                fields=['account', 'external_id'],
                name='unique_transaction_external_id_per_account',
            )
        ]

    def __str__(self):
        return f"{self.description} ({self.amount})"
