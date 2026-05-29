from decimal import Decimal
import datetime

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from apps.imports.services.parser import parse_excel, ParseError
from apps.imports.services.categorizer import suggest_category
from apps.imports.services.deduplicator import filter_duplicates
from apps.accounts.models import Account
from apps.transactions.models import Transaction
from apps.categories.models import Category


class PreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed = parse_excel(file)
        except ParseError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'error': 'Format de fichier non reconnu.'}, status=status.HTTP_400_BAD_REQUEST)

        user_accounts = list(Account.objects.filter(user=request.user))
        existing_accounts = [
            {'id': a.id, 'name': a.name, 'account_type': a.account_type}
            for a in user_accounts
        ]

        transactions_out = {}
        duplicate_counts = {}

        for rib, txs in parsed['transactions'].items():
            matching_account = next(
                (a for a in user_accounts if rib in a.name or a.name in rib),
                None
            )
            account_id = matching_account.id if matching_account else None

            enriched = [
                {**tx, 'suggested_category': suggest_category(tx['description']), 'category_id': None}
                for tx in txs
            ]

            dup_count = 0
            if account_id:
                _, dup_count = filter_duplicates(txs, account_id)

            transactions_out[rib] = enriched
            duplicate_counts[rib] = dup_count

        return Response({
            'accounts': parsed['accounts'],
            'existing_accounts': existing_accounts,
            'transactions': transactions_out,
            'duplicate_counts': duplicate_counts,
        })


class ConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        mapping = request.data.get('mapping', {})
        transactions_payload = request.data.get('transactions', {})

        created_accounts = 0
        created_transactions = 0

        # Create new accounts first
        for rib, account_config in mapping.items():
            if account_config.get('create'):
                acc = Account.objects.create(
                    user=request.user,
                    name=account_config['name'],
                    account_type=account_config.get('account_type', 'checking'),
                    initial_balance=0,
                    color='#6366f1',
                    icon='CreditCard',
                )
                account_config['id'] = acc.id
                created_accounts += 1

        # Pre-fetch user categories once to avoid N+1 on category lookup
        categories_by_id = {c.id: c for c in Category.objects.filter(user=request.user)}

        for rib, txs in transactions_payload.items():
            account_config = mapping.get(rib, {})
            account_id = account_config.get('id')
            if not account_id:
                continue

            try:
                account = Account.objects.get(id=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response(
                    {'error': f'Compte {account_id} introuvable.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Normalize existing transactions to (date_string, Decimal, str) for comparison
            existing_txs = set()
            for date_val, amount_val, desc in Transaction.objects.filter(account=account).values_list(
                'date', 'amount', 'description'
            ):
                if isinstance(date_val, datetime.date):
                    date_str = date_val.strftime('%Y-%m-%d')
                else:
                    date_str = str(date_val)
                existing_txs.add((date_str, Decimal(str(amount_val)).quantize(Decimal('0.01')), desc))

            for tx in txs:
                amount = Decimal(str(tx['amount'])).quantize(Decimal('0.01'))
                # tx['date'] is a string like '2026-05-01'
                date_str = str(tx['date'])
                key = (date_str, amount, tx['description'])
                if key in existing_txs:
                    continue

                category = categories_by_id.get(tx.get('category_id'))

                Transaction.objects.create(
                    user=request.user,
                    account=account,
                    transaction_type=tx['transaction_type'],
                    amount=amount,
                    description=tx['description'],
                    date=tx['date'],
                    category=category,
                    is_recurring=bool(tx.get('is_recurring', False)),
                    note='',
                    tags=[],
                )
                created_transactions += 1

        return Response({
            'created_accounts': created_accounts,
            'created_transactions': created_transactions,
        })
