from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Account
from .models import UserPreference


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def preferences_view(request):
    pref, _ = UserPreference.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response({
            'primary_account': pref.primary_account_id,
            'primary_account_name': pref.primary_account.name if pref.primary_account else None,
        })

    # PATCH
    if 'primary_account' not in request.data:
        return Response({'error': 'primary_account is required.'}, status=status.HTTP_400_BAD_REQUEST)

    account_id = request.data['primary_account']
    if account_id is None:
        pref.primary_account = None
        pref.save()
        return Response({'primary_account': None, 'primary_account_name': None})

    try:
        account = Account.objects.get(pk=account_id, user=request.user, is_active=True)
    except Account.DoesNotExist:
        return Response({'error': 'Compte introuvable ou accès refusé.'}, status=status.HTTP_400_BAD_REQUEST)

    pref.primary_account = account
    pref.save()
    return Response({
        'primary_account': account.id,
        'primary_account_name': account.name,
    })
