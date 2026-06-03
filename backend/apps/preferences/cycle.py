from datetime import date
from calendar import monthrange
from dateutil.relativedelta import relativedelta


def get_cycle_start(today: date, cycle_start_day: int) -> date:
    if today.day >= cycle_start_day:
        return today.replace(day=cycle_start_day)
    prev = today.replace(day=1) - relativedelta(months=1)
    return prev.replace(day=min(cycle_start_day, monthrange(prev.year, prev.month)[1]))


def get_cycle_start_nth_ago(today: date, cycle_start_day: int, n: int) -> date:
    current = get_cycle_start(today, cycle_start_day)
    return current - relativedelta(months=n)
