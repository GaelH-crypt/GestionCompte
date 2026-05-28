from django.db import models
from django.contrib.auth.models import User


class Credit(models.Model):
    CREDIT_TYPES = [
        ('mortgage', 'Immobilier'),
        ('auto', 'Auto'),
        ('consumer', 'Consommation'),
        ('other', 'Autre'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='credits')
    name = models.CharField(max_length=100)
    credit_type = models.CharField(max_length=20, choices=CREDIT_TYPES, default='consumer')
    initial_capital = models.DecimalField(max_digits=12, decimal_places=2)
    remaining_capital = models.DecimalField(max_digits=12, decimal_places=2)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2)
    monthly_payment = models.DecimalField(max_digits=10, decimal_places=2)
    insurance_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    duration_months = models.IntegerField()
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    early_repayment_possible = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return self.name
