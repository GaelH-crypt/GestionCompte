from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Account
from .serializers import AccountSerializer


class AccountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AccountSerializer

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user)
