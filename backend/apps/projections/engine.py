from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta

# Maximum horizon we pre-generate yearly occurrences for (matches the UI's max of 60 months).
_MAX_HORIZON_MONTHS = 60


class ProjectionEngine:
    """Compute monthly balance projections from recurring cashflows."""

    def __init__(self, current_balance: Decimal, monthly_income: Decimal,
                 monthly_expenses: Decimal, monthly_credits: Decimal,
                 yearly_events: list = None, overrides: dict = None):
        self.current_balance = Decimal(str(current_balance))
        self.monthly_income = Decimal(str(monthly_income))
        self.monthly_expenses = Decimal(str(monthly_expenses))
        self.monthly_credits = Decimal(str(monthly_credits))
        # yearly_events: [{'year': int, 'month': int, 'amount': Decimal, 'type': 'income'|'expense'}]
        self.yearly_events = yearly_events or []
        self.overrides = overrides or {}

    def _yearly_for_month(self, year: int, month: int, tx_type: str) -> Decimal:
        return sum(
            e['amount'] for e in self.yearly_events
            if e['year'] == year and e['month'] == month and e['type'] == tx_type
        )

    def project(self, months: int) -> list:
        balance = self.current_balance
        today = date.today()
        result = []

        for i in range(months):
            month_date = today + relativedelta(months=i + 1)
            y, m = month_date.year, month_date.month

            income = self.overrides.get('income', self.monthly_income) + self._yearly_for_month(y, m, 'income')
            expenses = self.overrides.get('expenses', self.monthly_expenses) + self._yearly_for_month(y, m, 'expense')
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

    # Monthly and weekly recurring: convert to per-month average.
    freq_multipliers = {
        'monthly': Decimal('1'),
        'weekly': Decimal('52') / Decimal('12'),
    }

    def monthly_sum(transaction_type: str) -> Decimal:
        total = Decimal('0')
        for freq, multiplier in freq_multipliers.items():
            agg = RecurringTransaction.objects.filter(
                user=user, is_active=True, transaction_type=transaction_type, frequency=freq
            ).aggregate(t=Sum('amount'))['t']
            if agg:
                total += agg * multiplier
        return total

    monthly_income = monthly_sum('income')
    monthly_expenses = monthly_sum('expense')

    # Yearly recurring: generate actual occurrences so each amount lands in the
    # correct month rather than being smoothed across every month in the horizon.
    today = date.today()
    end_date = today + relativedelta(months=_MAX_HORIZON_MONTHS)
    yearly_events = []
    for rt in RecurringTransaction.objects.filter(user=user, is_active=True, frequency='yearly'):
        occ = rt.next_occurrence
        while occ <= end_date:
            yearly_events.append({
                'year': occ.year,
                'month': occ.month,
                'amount': rt.amount,
                'type': rt.transaction_type,
            })
            occ = occ + relativedelta(years=1)

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
        yearly_events=yearly_events,
        overrides=decimal_overrides,
    )
