from datetime import date

from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .engine import build_engine_from_user

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
    # 1-month horizon: return a day-by-day projection for maximum precision on
    # intra-month balance fluctuations.
    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        return Response(engine.project_daily(days))
    return Response(engine.project(months))


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

    engine = build_engine_from_user(request.user, overrides=overrides)
    result = engine.project(months)

    baseline_engine = build_engine_from_user(request.user)
    baseline = baseline_engine.project(months)

    for i, row in enumerate(result):
        row['baseline_balance'] = baseline[i]['balance']
        row['delta'] = round(row['balance'] - baseline[i]['balance'], 2)

    return Response(result)
