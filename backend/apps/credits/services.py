from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta


def _missing_fields(credit):
    return any(
        f is None for f in [credit.remaining_capital, credit.interest_rate, credit.monthly_payment]
    )


def calculate_credit_details(credit) -> dict:
    if credit.credit_type == 'revolving' or _missing_fields(credit):
        revolving_monthly = sum(
            d.monthly_payment for d in credit.draws.filter(is_active=True)
        ) if credit.credit_type == 'revolving' else 0
        return {
            'remaining_months': None,
            'total_interest': None,
            'total_cost': None,
            'total_monthly_charge': float(revolving_monthly),
            'estimated_end_date': None,
        }

    today = date.today()
    monthly_rate = Decimal(str(credit.interest_rate)) / Decimal('1200')
    total_monthly = credit.monthly_payment + credit.insurance_monthly

    capital = Decimal(str(credit.remaining_capital))
    months_left = 0
    total_interest = Decimal('0')

    while capital > Decimal('0.01') and months_left < 600:
        interest = capital * monthly_rate
        principal = credit.monthly_payment - interest
        if principal <= Decimal('0'):
            break
        total_interest += interest
        capital = max(capital - principal, Decimal('0'))
        months_left += 1

    end_date = today + relativedelta(months=months_left)

    return {
        'remaining_months': months_left,
        'total_interest': round(float(total_interest), 2),
        'total_cost': round(float(credit.remaining_capital) + float(total_interest), 2),
        'total_monthly_charge': round(float(total_monthly), 2),
        'estimated_end_date': end_date.isoformat(),
    }


def generate_schedule(credit, max_months: int = 12) -> list:
    if credit.credit_type == 'revolving' or _missing_fields(credit):
        return []
    monthly_rate = Decimal(str(credit.interest_rate)) / Decimal('1200')
    capital = Decimal(str(credit.remaining_capital))
    schedule = []
    for i in range(min(max_months, 360)):
        interest = capital * monthly_rate
        principal = credit.monthly_payment - interest
        if principal <= Decimal('0') or capital <= Decimal('0.01'):
            break
        capital = max(capital - principal, Decimal('0'))
        schedule.append({
            'month': i + 1,
            'interest': round(float(interest), 2),
            'principal': round(float(principal), 2),
            'remaining_capital': round(float(capital), 2),
        })
    return schedule


def _next_occurrence(start_date, payment_day):
    """Renvoie la prochaine date de prélèvement >= aujourd'hui."""
    import calendar
    today = date.today()
    if payment_day is None:
        d = start_date
        while d < today:
            d += relativedelta(months=1)
        return d

    candidate = today.replace(day=1)
    for _ in range(24):
        last_day = calendar.monthrange(candidate.year, candidate.month)[1]
        day = min(payment_day, last_day)
        candidate = candidate.replace(day=day)
        if candidate >= today:
            return candidate
        candidate = (candidate.replace(day=1) + relativedelta(months=1))
    return today


def _find_category(user, credit_type):
    from apps.categories.models import Category
    if credit_type == 'mortgage':
        return Category.objects.filter(user=user, name='Crédit immobilier').first()
    return None


def sync_recurring_transaction(credit):
    """Crée, met à jour ou supprime le flux récurrent associé au crédit."""
    from apps.recurring.models import RecurringTransaction

    eligible = (
        credit.credit_type != 'revolving'
        and credit.monthly_payment is not None
        and credit.payment_account is not None
    )

    existing = RecurringTransaction.objects.filter(credit=credit).first()

    if not eligible:
        if existing:
            existing.delete()
        return

    amount = Decimal(str(credit.monthly_payment)) + Decimal(str(credit.insurance_monthly or 0))
    next_occ = _next_occurrence(credit.start_date, credit.payment_day)
    category = _find_category(credit.user, credit.credit_type)

    if existing:
        existing.name = credit.name
        existing.amount = amount
        existing.next_occurrence = next_occ
        existing.account = credit.payment_account
        existing.category = category
        existing.save()
    else:
        RecurringTransaction.objects.create(
            user=credit.user,
            name=credit.name,
            amount=amount,
            transaction_type='expense',
            frequency='monthly',
            next_occurrence=next_occ,
            account=credit.payment_account,
            category=category,
            credit=credit,
        )
