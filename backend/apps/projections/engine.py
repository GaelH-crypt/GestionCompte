from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta


class ProjectionEngine:
    """Compute monthly balance projections from recurring cashflows."""

    def __init__(self, current_balance: Decimal, monthly_income: Decimal,
                 monthly_expenses: Decimal, monthly_credits: Decimal,
                 overrides: dict = None):
        self.current_balance = Decimal(str(current_balance))
        self.monthly_income = Decimal(str(monthly_income))
        self.monthly_expenses = Decimal(str(monthly_expenses))
        self.monthly_credits = Decimal(str(monthly_credits))
        self.overrides = overrides or {}

    def project(self, months: int) -> list:
        balance = self.current_balance
        today = date.today()
        result = []

        for i in range(months):
            month_date = today + relativedelta(months=i + 1)
            income = self.overrides.get('income', self.monthly_income)
            expenses = self.overrides.get('expenses', self.monthly_expenses)
            credits = self.overrides.get('credits', self.monthly_credits)

            net = income - expenses - credits
            balance += net

            result.append({
                'month': month_date.strftime('%b %Y'),
                'date': month_date.isoformat(),
                'income': float(income),
                'expenses': float(expenses),
                'credits': float(credits),
                'net': float(net),
                'balance': float(balance),
            })

        return result


def build_engine_from_user(user, overrides: dict = None) -> ProjectionEngine:
    """Build ProjectionEngine from user's real data."""
    from django.db.models import Sum
    from apps.accounts.models import Account
    from apps.accounts.services import get_account_balance
    from apps.credits.models import Credit
    from apps.recurring.models import RecurringTransaction

    accounts = Account.objects.filter(user=user, is_active=True)
    total_balance = sum(get_account_balance(a) for a in accounts) or Decimal('0')

    monthly_income = RecurringTransaction.objects.filter(
        user=user, is_active=True, transaction_type='income', frequency='monthly'
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

    monthly_expenses = RecurringTransaction.objects.filter(
        user=user, is_active=True, transaction_type='expense', frequency='monthly'
    ).aggregate(t=Sum('amount'))['t'] or Decimal('0')

    credit_agg = Credit.objects.filter(user=user, is_active=True).aggregate(
        p=Sum('monthly_payment'), ins=Sum('insurance_monthly')
    )
    monthly_credits = (credit_agg['p'] or Decimal('0')) + (credit_agg['ins'] or Decimal('0'))

    decimal_overrides = {}
    if overrides:
        for k, v in overrides.items():
            if k in ('income', 'expenses', 'credits') and v is not None:
                decimal_overrides[k] = Decimal(str(v))

    return ProjectionEngine(
        current_balance=total_balance,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_credits=monthly_credits,
        overrides=decimal_overrides,
    )
