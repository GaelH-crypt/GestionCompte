from decimal import Decimal
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

# Maximum horizon we pre-generate yearly occurrences for (matches the UI's max of 60 months).
_MAX_HORIZON_MONTHS = 60


class ProjectionEngine:
    """Compute monthly balance projections from recurring cashflows."""

    def __init__(self, current_balance: Decimal, monthly_income: Decimal,
                 monthly_expenses: Decimal, monthly_credits: Decimal,
                 yearly_events: list = None, overrides: dict = None,
                 daily_events: list = None):
        self.current_balance = Decimal(str(current_balance))
        self.monthly_income = Decimal(str(monthly_income))
        self.monthly_expenses = Decimal(str(monthly_expenses))
        self.monthly_credits = Decimal(str(monthly_credits))
        # yearly_events: [{'year': int, 'month': int, 'amount': Decimal, 'type': 'income'|'expense'}]
        self.yearly_events = yearly_events or []
        # daily_events: [{'date': date, 'amount': Decimal, 'kind': 'income'|'expenses'|'credits'}]
        # Each cashflow placed on its real day, for fine-grained day-by-day projection.
        self.daily_events = daily_events or []
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
            expenses = (
                self.overrides.get('expenses', self.monthly_expenses)
                + self._yearly_for_month(y, m, 'expense')
                + Decimal(str(self.overrides.get('extra_expenses', 0)))
            )
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

    def project_daily(self, days: int) -> list:
        """Day-by-day projection: each cashflow lands on its real date, so the
        balance reflects intra-month fluctuations rather than a smoothed total."""
        days_d = Decimal(str(days))

        # Override deltas: distribute (override - actual) evenly across days.
        income_daily = (
            self.overrides.get('income', self.monthly_income) - self.monthly_income
        ) / days_d
        expenses_delta = self.overrides.get('expenses', self.monthly_expenses) - self.monthly_expenses
        extra = self.overrides.get('extra_expenses', Decimal('0'))
        expenses_daily = (expenses_delta + extra) / days_d
        credits_daily = (
            self.overrides.get('credits', self.monthly_credits) - self.monthly_credits
        ) / days_d

        balance = self.current_balance
        today = date.today()

        by_date = {}
        for e in self.daily_events:
            bucket = by_date.setdefault(
                e['date'],
                {'income': Decimal('0'), 'expenses': Decimal('0'), 'credits': Decimal('0'), 'events': []},
            )
            bucket[e['kind']] += e['amount']
            bucket['events'].append({
                'label': e.get('label', ''),
                'amount': float(e['amount']),
                'kind': e['kind'],
            })

        result = []
        for i in range(days):
            day = today + timedelta(days=i + 1)
            b = by_date.get(day)
            income = (b['income'] if b else Decimal('0')) + income_daily
            expenses = (b['expenses'] if b else Decimal('0')) + expenses_daily
            credits = (b['credits'] if b else Decimal('0')) + credits_daily

            net = income - expenses - credits
            balance += net

            result.append({
                # Compact day label (e.g. "30/05"), reused as the chart X axis key.
                'month': day.strftime('%d/%m'),
                'date': day.isoformat(),
                'income': float(income),
                'expenses': float(expenses),
                'credits': float(credits),
                'net': float(net),
                'balance': float(balance),
                'events': b['events'] if b else [],
            })

        return result


def build_engine_from_user(user, overrides: dict = None) -> ProjectionEngine:
    """Build ProjectionEngine from user's real data."""
    from django.db.models import Sum
    from apps.accounts.models import Account
    from apps.accounts.services import get_account_balance
    from apps.credits.models import Credit, CreditDraw
    from apps.recurring.models import RecurringTransaction

    accounts = Account.objects.filter(user=user, is_active=True).exclude(account_type='credit')
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
                user=user, is_active=True, transaction_type=transaction_type, frequency=freq,
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

    # Only count credits that have NO linked active recurring transaction that
    # already contributes to monthly_expenses (expense, monthly or weekly).
    # Yearly or income recurrences do not replace the monthly credit charge.
    covered_credit_ids = list(
        RecurringTransaction.objects.filter(
            user=user, is_active=True, credit__isnull=False,
            transaction_type='expense', frequency__in=('monthly', 'weekly'),
        ).values_list('credit_id', flat=True).distinct()
    )
    uncovered = Credit.objects.filter(user=user, is_active=True).exclude(id__in=covered_credit_ids)
    credit_agg = uncovered.exclude(credit_type='revolving').aggregate(
        p=Sum('monthly_payment'), ins=Sum('insurance_monthly')
    )
    monthly_credits = (credit_agg['p'] or Decimal('0')) + (credit_agg['ins'] or Decimal('0'))
    revolving_draws = CreditDraw.objects.filter(
        credit__in=uncovered.filter(credit_type='revolving'), is_active=True,
    ).aggregate(t=Sum('monthly_payment'))['t']
    monthly_credits += (revolving_draws or Decimal('0'))

    # Day-by-day cashflow events for the fine-grained (1-month) projection: place
    # every recurrence and credit charge on its real date. ~2 months covers the
    # longest "1 mois" window with margin.
    daily_end = today + timedelta(days=62)
    daily_events = []

    # Pre-fetch transactions from the current month to detect recurring charges that
    # were already paid via import. Two detection layers:
    # 1. Explicit link (recurring_transaction FK) — takes priority, works even when
    #    amounts differ (e.g. variable childcare payments).
    # 2. Heuristic (amount + type + account) — fallback for unlinked transactions.
    from apps.transactions.models import Transaction as _Tx
    first_of_month = today.replace(day=1)
    _month_rows = list(
        _Tx.objects.filter(user=user, date__gte=first_of_month, date__lte=today)
        .values('amount', 'transaction_type', 'account_id', 'recurring_transaction_id')
    )
    _linked_this_month = {r['recurring_transaction_id'] for r in _month_rows if r['recurring_transaction_id']}
    _paid_this_month = {(r['amount'], r['transaction_type'], r['account_id']) for r in _month_rows}

    _freq_step = {
        'weekly': relativedelta(weeks=1),
        'monthly': relativedelta(months=1),
        'yearly': relativedelta(years=1),
    }
    for rt in RecurringTransaction.objects.filter(user=user, is_active=True):
        step = _freq_step.get(rt.frequency)
        if step is None:
            continue
        kind = 'income' if rt.transaction_type == 'income' else 'expenses'
        occ = rt.next_occurrence
        # Catch up past occurrences to the projection window without emitting them.
        while occ <= today:
            occ = occ + step
        # If the next occurrence falls in the current calendar month, check whether
        # it has already been paid:
        # 1. Explicit link (priority — handles variable amounts like childcare).
        # 2. Heuristic amount+type+account fallback for unlinked transactions.
        if occ.year == today.year and occ.month == today.month:
            if rt.id in _linked_this_month or (
                # Heuristic only applies to monthly/yearly: weekly charges can have
                # multiple occurrences per month, so a past weekly payment would
                # incorrectly suppress the next unpaid occurrence.
                rt.frequency in ('monthly', 'yearly')
                and (rt.amount, rt.transaction_type, rt.account_id) in _paid_this_month
            ):
                occ = occ + step
        while occ <= daily_end:
            daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind, 'label': rt.name})
            occ = occ + step

    # Credits not already covered by a recurring expense (same rule as monthly_credits),
    # charged on their start-date day-of-month each month within the window.
    for credit in uncovered.exclude(credit_type='revolving'):
        amount = (credit.monthly_payment or Decimal('0')) + (credit.insurance_monthly or Decimal('0'))
        if amount == 0:
            continue
        for pay_date in _monthly_charge_dates(credit.start_date.day, today, daily_end):
            daily_events.append({'date': pay_date, 'amount': amount, 'kind': 'credits', 'label': credit.name})

    for credit in uncovered.filter(credit_type='revolving').prefetch_related('draws'):
        amount = sum(d.monthly_payment for d in credit.draws.all() if d.is_active)
        if not amount:
            continue
        for pay_date in _monthly_charge_dates(credit.start_date.day, today, daily_end):
            daily_events.append({'date': pay_date, 'amount': Decimal(str(amount)), 'kind': 'credits', 'label': credit.name})

    decimal_overrides = {}
    if overrides:
        for k, v in overrides.items():
            if k in ('income', 'expenses', 'credits', 'extra_expenses') and v is not None:
                decimal_overrides[k] = Decimal(str(v))

    return ProjectionEngine(
        current_balance=total_balance,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_credits=monthly_credits,
        yearly_events=yearly_events,
        overrides=decimal_overrides,
        daily_events=daily_events,
    )


def build_engine_for_account(user, account_id: int, overrides: dict = None) -> 'ProjectionEngine':
    """Build ProjectionEngine scoped to a single account (for checking account projection)."""
    from django.db.models import Sum
    from apps.accounts.models import Account
    from apps.accounts.services import get_account_balance
    from apps.credits.models import Credit, CreditDraw
    from apps.recurring.models import RecurringTransaction

    try:
        account = Account.objects.get(pk=account_id, user=user, is_active=True)
    except Account.DoesNotExist:
        return ProjectionEngine(current_balance=Decimal('0'), monthly_income=Decimal('0'),
                                monthly_expenses=Decimal('0'), monthly_credits=Decimal('0'))

    current_balance = get_account_balance(account)

    freq_multipliers = {
        'monthly': Decimal('1'),
        'weekly': Decimal('52') / Decimal('12'),
    }

    def monthly_sum_for_account(transaction_type: str) -> Decimal:
        total = Decimal('0')
        for freq, multiplier in freq_multipliers.items():
            agg = RecurringTransaction.objects.filter(
                user=user, is_active=True, transaction_type=transaction_type,
                frequency=freq, account_id=account_id,
            ).aggregate(t=Sum('amount'))['t']
            if agg:
                total += agg * multiplier
        return total

    monthly_income = monthly_sum_for_account('income')
    monthly_expenses = monthly_sum_for_account('expense')

    # Yearly recurring for this account only
    today = date.today()
    end_date = today + relativedelta(months=_MAX_HORIZON_MONTHS)
    yearly_events = []
    for rt in RecurringTransaction.objects.filter(
        user=user, is_active=True, frequency='yearly', account_id=account_id
    ):
        occ = rt.next_occurrence
        while occ <= end_date:
            yearly_events.append({
                'year': occ.year, 'month': occ.month,
                'amount': rt.amount, 'type': rt.transaction_type,
            })
            occ = occ + relativedelta(years=1)

    # Credits: include uncovered credits (assumed paid from checking account)
    covered_credit_ids = list(
        RecurringTransaction.objects.filter(
            user=user, is_active=True, credit__isnull=False,
            transaction_type='expense', frequency__in=('monthly', 'weekly'),
        ).values_list('credit_id', flat=True).distinct()
    )
    uncovered = Credit.objects.filter(user=user, is_active=True).exclude(id__in=covered_credit_ids)
    credit_agg = uncovered.exclude(credit_type='revolving').aggregate(
        p=Sum('monthly_payment'), ins=Sum('insurance_monthly')
    )
    monthly_credits = (credit_agg['p'] or Decimal('0')) + (credit_agg['ins'] or Decimal('0'))
    revolving_draws = CreditDraw.objects.filter(
        credit__in=uncovered.filter(credit_type='revolving'), is_active=True,
    ).aggregate(t=Sum('monthly_payment'))['t']
    monthly_credits += (revolving_draws or Decimal('0'))

    # Daily events: recurring filtered by account_id + credit charges (uncovered)
    daily_end = today + timedelta(days=62)
    daily_events = []

    from apps.transactions.models import Transaction as _Tx
    first_of_month = today.replace(day=1)
    _month_rows = list(
        _Tx.objects.filter(user=user, date__gte=first_of_month, date__lte=today, account_id=account_id)
        .values('amount', 'transaction_type', 'account_id', 'recurring_transaction_id')
    )
    _linked_this_month = {r['recurring_transaction_id'] for r in _month_rows if r['recurring_transaction_id']}
    _paid_this_month = {(r['amount'], r['transaction_type'], r['account_id']) for r in _month_rows}

    _freq_step = {
        'weekly': relativedelta(weeks=1),
        'monthly': relativedelta(months=1),
        'yearly': relativedelta(years=1),
    }
    for rt in RecurringTransaction.objects.filter(user=user, is_active=True, account_id=account_id):
        step = _freq_step.get(rt.frequency)
        if step is None:
            continue
        kind = 'income' if rt.transaction_type == 'income' else 'expenses'
        occ = rt.next_occurrence
        while occ <= today:
            occ = occ + step
        if occ.year == today.year and occ.month == today.month:
            if rt.id in _linked_this_month or (
                rt.frequency in ('monthly', 'yearly')
                and (rt.amount, rt.transaction_type, rt.account_id) in _paid_this_month
            ):
                occ = occ + step
        while occ <= daily_end:
            daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind, 'label': rt.name})
            occ = occ + step

    for credit in uncovered.exclude(credit_type='revolving'):
        amount = (credit.monthly_payment or Decimal('0')) + (credit.insurance_monthly or Decimal('0'))
        if amount == 0:
            continue
        for pay_date in _monthly_charge_dates(credit.start_date.day, today, daily_end):
            daily_events.append({'date': pay_date, 'amount': amount, 'kind': 'credits', 'label': credit.name})

    for credit in uncovered.filter(credit_type='revolving').prefetch_related('draws'):
        amount = sum(d.monthly_payment for d in credit.draws.all() if d.is_active)
        if not amount:
            continue
        for pay_date in _monthly_charge_dates(credit.start_date.day, today, daily_end):
            daily_events.append({'date': pay_date, 'amount': Decimal(str(amount)), 'kind': 'credits', 'label': credit.name})

    decimal_overrides = {}
    if overrides:
        for k, v in overrides.items():
            if k in ('income', 'expenses', 'credits', 'extra_expenses') and v is not None:
                decimal_overrides[k] = Decimal(str(v))

    return ProjectionEngine(
        current_balance=current_balance,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_credits=monthly_credits,
        yearly_events=yearly_events,
        overrides=decimal_overrides,
        daily_events=daily_events,
    )


def _monthly_charge_dates(day_of_month: int, start: date, end: date) -> list:
    """Dates falling on `day_of_month` (clamped to month length) within (start, end]."""
    import calendar
    dates = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        last_day = calendar.monthrange(cursor.year, cursor.month)[1]
        d = date(cursor.year, cursor.month, min(day_of_month, last_day))
        if start < d <= end:
            dates.append(d)
        cursor = cursor + relativedelta(months=1)
    return dates
