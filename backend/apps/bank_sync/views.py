import uuid
import logging

from decouple import config
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Account
from .models import BankAccount, BankRequisition
from .serializers import BankAccountSerializer, BankRequisitionSerializer, SyncLogSerializer
from .services import gocardless
from .services.gocardless import GoCardlessError
from .services.sync import sync_bank_account

logger = logging.getLogger(__name__)

REDIRECT_URI = config('GOCARDLESS_REDIRECT_URI', default='http://localhost/bank-sync/callback')


class InstitutionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        country = request.query_params.get('country', 'FR')
        try:
            institutions = gocardless.list_institutions(country)
        except GoCardlessError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(institutions)


class RequisitionViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BankRequisitionSerializer

    def get_queryset(self):
        return BankRequisition.objects.filter(
            user=self.request.user
        ).prefetch_related('bank_accounts__linked_account', 'bank_accounts__sync_logs')

    def list(self, request):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def create(self, request):
        institution_id = request.data.get('institution_id')
        if not institution_id:
            return Response({'error': 'institution_id est requis.'}, status=status.HTTP_400_BAD_REQUEST)

        institution_name = request.data.get('institution_name', '')
        institution_logo = request.data.get('institution_logo', '')
        reference = str(uuid.uuid4())

        try:
            gc_req = gocardless.create_requisition(institution_id, REDIRECT_URI, reference)
        except GoCardlessError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        requisition = BankRequisition.objects.create(
            user=request.user,
            requisition_id=gc_req['id'],
            institution_id=institution_id,
            institution_name=institution_name,
            institution_logo=institution_logo,
            status='CR',
            redirect_url=gc_req.get('link', ''),
            reference=reference,
        )
        return Response(
            {'id': requisition.id, 'redirect_url': gc_req.get('link', '')},
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, pk=None):
        try:
            requisition = BankRequisition.objects.get(pk=pk, user=request.user)
        except BankRequisition.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        requisition.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'])
    def callback(self, request):
        """
        Called by the frontend after the bank auth redirect.
        Receives { ref: "..." } — the UUID reference we passed to GoCardless.
        """
        ref = request.data.get('ref')
        if not ref:
            return Response({'error': 'ref est requis.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            requisition = BankRequisition.objects.get(reference=ref, user=request.user)
        except BankRequisition.DoesNotExist:
            return Response({'error': 'Connexion bancaire introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            gc_req = gocardless.get_requisition(requisition.requisition_id)
        except GoCardlessError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        requisition.status = gc_req.get('status', 'LN')
        requisition.save(update_fields=['status'])

        created_accounts = []
        for account_id in gc_req.get('accounts', []):
            if BankAccount.objects.filter(account_id=account_id).exists():
                continue
            try:
                details = gocardless.get_account_details(account_id)
                account_data = details.get('account', {})
                bank_acc = BankAccount.objects.create(
                    requisition=requisition,
                    account_id=account_id,
                    iban=account_data.get('iban', ''),
                    name=account_data.get('name') or account_data.get('ownerName') or account_id,
                    currency=account_data.get('currency', 'EUR'),
                )
                created_accounts.append(bank_acc)
            except GoCardlessError as exc:
                logger.warning('Could not fetch details for account %s: %s', account_id, exc)

        serializer = self.get_serializer(requisition)
        return Response({
            'requisition': serializer.data,
            'bank_accounts_created': len(created_accounts),
        })


class BankAccountViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BankAccountSerializer

    def get_queryset(self):
        return BankAccount.objects.filter(
            requisition__user=self.request.user
        ).select_related('requisition', 'linked_account').prefetch_related('sync_logs')

    def list(self, request):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        """Allow updating linked_account only."""
        try:
            bank_account = self.get_queryset().get(pk=pk)
        except BankAccount.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        linked_account_id = request.data.get('linked_account')
        if linked_account_id is not None:
            if linked_account_id == '' or linked_account_id is None:
                bank_account.linked_account = None
            else:
                try:
                    account = Account.objects.get(pk=linked_account_id, user=request.user)
                except Account.DoesNotExist:
                    return Response({'error': 'Compte introuvable.'}, status=status.HTTP_400_BAD_REQUEST)
                bank_account.linked_account = account
            bank_account.save(update_fields=['linked_account'])

        return Response(self.get_serializer(bank_account).data)

    @action(detail=True, methods=['post'])
    def sync(self, request, pk=None):
        try:
            bank_account = self.get_queryset().get(pk=pk)
        except BankAccount.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        linked_account_id = request.data.get('linked_account_id')

        if not linked_account_id and not bank_account.linked_account_id:
            return Response(
                {'error': 'Aucun compte GestionCompte lié. Veuillez en choisir un.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = sync_bank_account(
                bank_account,
                linked_account_id=int(linked_account_id) if linked_account_id else None,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except GoCardlessError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(result)

    @action(detail=True, methods=['get'], url_path='sync-logs')
    def sync_logs(self, request, pk=None):
        try:
            bank_account = self.get_queryset().get(pk=pk)
        except BankAccount.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        logs = bank_account.sync_logs.all()[:20]
        return Response(SyncLogSerializer(logs, many=True).data)
