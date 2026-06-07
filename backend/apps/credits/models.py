from django.db import models
from django.contrib.auth.models import User


class Credit(models.Model):
    CREDIT_TYPES = [
        ('mortgage', 'Immobilier'),
        ('auto', 'Auto'),
        ('consumer', 'Consommation'),
        ('revolving', 'Revolving'),
        ('other', 'Autre'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='credits')
    name = models.CharField(max_length=100)
    credit_type = models.CharField(max_length=20, choices=CREDIT_TYPES, default='consumer')
    initial_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    remaining_capital = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    monthly_payment = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    insurance_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_months = models.IntegerField(null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    max_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    payment_day = models.PositiveSmallIntegerField(null=True, blank=True)
    payment_account = models.ForeignKey(
        'accounts.Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='credits_drawn',
    )
    early_repayment_possible = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return self.name


class CreditDraw(models.Model):
    credit = models.ForeignKey(Credit, on_delete=models.CASCADE, related_name='draws')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    monthly_payment = models.DecimalField(max_digits=10, decimal_places=2)
    duration_months = models.IntegerField()
    start_date = models.DateField()
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.credit.name} — {self.amount}€ ({self.start_date})'
