from datetime import date

from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.preferences.models import UserPreference
from .engine import build_engine_from_user, build_engine_for_account

VALID_HORIZONS = {1, 3, 6, 12, 60}

# Horizons pour lesquels la vue jour-le-jour est autorisée.
DAILY_HORIZONS = {1, 3, 6}


def _parse_bool(value) -> bool:
    """True for truthy query/body values; None or anything else → False."""
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _run_projection(engine, months: int, daily: bool) -> list:
    """Lance la projection mensuelle ou jour-le-jour selon `daily`."""
    if daily:
        today = date.today()
        days = (today + relativedelta(months=months) - today).days
        return engine.project_daily(days)
    return engine.project(months)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def projection_view(request):
    try:
        months = int(request.query_params.get('months', 12))
    except (ValueError, TypeError):
        return Response({'error': 'months must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
    if months not in VALID_HORIZONS:
        return Response({'error': 'months must be 1, 3, 6, 12 or 60'}, status=status.HTTP_400_BAD_REQUEST)

    pref = UserPreference.objects.filter(
        user=request.user
    ).select_related('primary_account').first()
    cycle_start_day = pref.cycle_start_day if pref else 1

    engine = build_engine_from_user(request.user, cycle_start_day=cycle_start_day)

    checking_engine = None
    if pref and pref.primary_account and pref.primary_account.is_active:
        checking_engine = build_engine_for_account(
            request.user, pref.primary_account_id, cycle_start_day=cycle_start_day
        )

    daily = _parse_bool(request.query_params.get('daily')) and months in DAILY_HORIZONS

    result = _run_projection(engine, months, daily)
    if checking_engine:
        checking_result = _run_projection(checking_engine, months, daily)
        result[0]['checking_start_balance'] = float(checking_engine.current_balance)
        for row, crow in zip(result, checking_result):
            row['checking_balance'] = crow['balance']
    else:
        for row in result:
            row['checking_balance'] = None
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def simulation_view(request):
    """Sandbox simulation — does NOT modify real data."""
    try:
        months = int(request.data.get('months', 12))
    except (ValueError, TypeError):
        months = 12
    if months not in VALID_HORIZONS:
        return Response({'error': 'months must be 1, 3, 6, 12 or 60'}, status=status.HTTP_400_BAD_REQUEST)

    overrides = {}
    for k in ('income', 'expenses', 'credits'):
        v = request.data.get(k)
        if v is not None:
            try:
                overrides[k] = float(v)
            except (ValueError, TypeError):
                pass

    extra_expenses_list = request.data.get('extra_expenses', [])
    if isinstance(extra_expenses_list, list):
        total_extra = 0.0
        for item in extra_expenses_list:
            try:
                total_extra += float(item.get('amount', 0))
            except (ValueError, TypeError, AttributeError):
                pass
        if total_extra > 0:
            overrides['extra_expenses'] = total_extra

    extra_income_list = request.data.get('extra_income', [])
    if isinstance(extra_income_list, list):
        total_extra_income = 0.0
        for item in extra_income_list:
            try:
                total_extra_income += float(item.get('amount', 0))
            except (ValueError, TypeError, AttributeError):
                pass
        if total_extra_income > 0:
            overrides['extra_income'] = total_extra_income

    pref = UserPreference.objects.filter(user=request.user).first()
    cycle_start_day = pref.cycle_start_day if pref else 1

    engine = build_engine_from_user(request.user, overrides=overrides, cycle_start_day=cycle_start_day)
    baseline_engine = build_engine_from_user(request.user, cycle_start_day=cycle_start_day)

    daily = _parse_bool(request.data.get('daily')) and months in DAILY_HORIZONS
    result = _run_projection(engine, months, daily)
    baseline = _run_projection(baseline_engine, months, daily)

    for i, row in enumerate(result):
        row['baseline_balance'] = baseline[i]['balance']
        row['delta'] = round(row['balance'] - baseline[i]['balance'], 2)

    return Response(result)
