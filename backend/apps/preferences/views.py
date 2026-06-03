from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Account
from .models import UserPreference


def _pref_response(pref):
    return {
        'primary_account': pref.primary_account_id,
        'primary_account_name': pref.primary_account.name if pref.primary_account else None,
        'cycle_start_day': pref.cycle_start_day,
    }


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def preferences_view(request):
    pref, _ = UserPreference.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response(_pref_response(pref))

    # PATCH — at least one known field required
    if 'primary_account' not in request.data and 'cycle_start_day' not in request.data:
        return Response(
            {'error': 'primary_account or cycle_start_day is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if 'cycle_start_day' in request.data:
        try:
            day = int(request.data['cycle_start_day'])
        except (ValueError, TypeError):
            return Response(
                {'error': 'cycle_start_day must be an integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (1 <= day <= 28):
            return Response(
                {'error': 'cycle_start_day must be between 1 and 28.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pref.cycle_start_day = day

    if 'primary_account' in request.data:
        account_id = request.data['primary_account']
        if account_id is None:
            pref.primary_account = None
        else:
            try:
                account = Account.objects.get(
                    pk=account_id, user=request.user,
                    is_active=True, account_type='checking',
                )
            except Account.DoesNotExist:
                return Response(
                    {'error': 'Compte introuvable, inactif ou non courant.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            pref.primary_account = account

    pref.save()
    return Response(_pref_response(pref))
