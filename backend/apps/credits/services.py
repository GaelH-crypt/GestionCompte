from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta


def calculate_credit_details(credit) -> dict:
    """Compute remaining months, total cost, monthly rate, schedule."""
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
    """Return first max_months payment schedule rows."""
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
