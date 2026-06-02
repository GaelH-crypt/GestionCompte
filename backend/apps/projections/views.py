from datetime import date

from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.preferences.models import UserPreference
from .engine import build_engine_from_user, build_engine_for_account

VALID_HORIZONS = {1, 3, 6, 12, 60}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def projection_view(request):
    try:
        months = int(request.query_params.get('months', 12))
    except (ValueError, TypeError):
        return Response({'error': 'months must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
    if months not in VALID_HORIZONS:
        return Response({'error': 'months must be 1, 3, 6, 12 or 60'}, status=status.HTTP_400_BAD_REQUEST)

    engine = build_engine_from_user(request.user)

    pref = UserPreference.objects.filter(
        user=request.user, primary_account__isnull=False, primary_account__is_active=True
    ).select_related('primary_account').first()
    checking_engine = build_engine_for_account(request.user, pref.primary_account_id) if pref else None

    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        result = engine.project_daily(days)
        if checking_engine:
            checking_result = checking_engine.project_daily(days)
            result[0]['checking_start_balance'] = float(checking_engine.current_balance)
            for row, crow in zip(result, checking_result):
                row['checking_balance'] = crow['balance']
        else:
            for row in result:
                row['checking_balance'] = None
        return Response(result)

    result = engine.project(months)
    if checking_engine:
        checking_result = checking_engine.project(months)
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

    engine = build_engine_from_user(request.user, overrides=overrides)
    baseline_engine = build_engine_from_user(request.user)

    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        result = engine.project_daily(days)
        baseline = baseline_engine.project_daily(days)
    else:
        result = engine.project(months)
        baseline = baseline_engine.project(months)

    for i, row in enumerate(result):
        row['baseline_balance'] = baseline[i]['balance']
        row['delta'] = round(row['balance'] - baseline[i]['balance'], 2)

    return Response(result)
