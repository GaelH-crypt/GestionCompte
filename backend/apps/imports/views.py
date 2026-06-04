from decimal import Decimal
import datetime
import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db import transaction as db_transaction

from apps.imports.services.parser import parse_excel, ParseError, ColumnMappingRequired
from apps.imports.services.categorizer import suggest_category
from apps.imports.services.deduplicator import filter_duplicates
from apps.accounts.models import Account
from apps.transactions.models import Transaction
from apps.categories.models import Category
from apps.categories.rules import apply_rules


class PreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        column_hints = None
        raw_hints = request.data.get('column_hints')
        if raw_hints:
            try:
                column_hints = json.loads(raw_hints)
            except (json.JSONDecodeError, TypeError):
                pass

        try:
            parsed = parse_excel(file, column_hints)
        except ColumnMappingRequired as e:
            return Response(
                {'error': 'column_mapping_required', 'sheets': e.sheets},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except ParseError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'error': 'Format de fichier non reconnu.'}, status=status.HTTP_400_BAD_REQUEST)

        user_accounts = list(Account.objects.filter(user=request.user))
        ignored_names = {a.name.lower() for a in user_accounts if a.is_import_ignored}
        existing_accounts = [
            {'id': a.id, 'name': a.name, 'account_type': a.account_type}
            for a in user_accounts
            if not a.is_import_ignored
        ]

        transactions_out = {}
        duplicate_counts = {}

        rib_to_imported_name = {a['rib']: a['name'] for a in parsed['accounts']}

        for rib, txs in parsed['transactions'].items():
            imported_name = rib_to_imported_name.get(rib, '')
            # Skip if this RIB/name matches an ignored account
            if imported_name.lower() in ignored_names:
                continue
            matching_account = next(
                (
                    a for a in user_accounts
                    if not a.is_import_ignored
                    and (rib in a.name or a.name in rib
                         or (imported_name and a.name.lower() == imported_name.lower()))
                ),
                None,
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

        visible_parsed_accounts = [
            a for a in parsed['accounts']
            if a['name'].lower() not in ignored_names
        ]
        return Response({
            'accounts': visible_parsed_accounts,
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

        skipped_ribs = []
        created_ids = []

        def _norm(r: str) -> str:
            return r.replace(' ', '').upper()

        def _find_config(rib: str) -> dict:
            if rib in mapping:
                return mapping[rib]
            norm_rib = _norm(rib)
            for k, v in mapping.items():
                norm_k = _norm(k)
                if norm_rib == norm_k or norm_rib in norm_k or norm_k in norm_rib:
                    return v
            return {}

        with db_transaction.atomic():
            for rib, txs in transactions_payload.items():
                account_config = _find_config(rib)
                account_id = account_config.get('id')
                if not account_id:
                    skipped_ribs.append(rib)
                    continue

                try:
                    account = Account.objects.get(id=account_id, user=request.user)
                except Account.DoesNotExist:
                    return Response(
                        {'error': f'Compte {account_id} introuvable ou inaccessible.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if account.is_import_ignored:
                    skipped_ribs.append(rib)
                    continue

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

                VALID_TYPES = {'expense', 'income', 'transfer'}
                for tx in txs:
                    if tx.get('transaction_type') not in VALID_TYPES:
                        continue
                    try:
                        date_obj = datetime.date.fromisoformat(str(tx.get('date', '')))
                    except ValueError:
                        continue
                    try:
                        amount = Decimal(str(tx['amount'])).quantize(Decimal('0.01'))
                    except Exception:
                        continue
                    date_str = date_obj.strftime('%Y-%m-%d')
                    desc = tx['description'][:255]
                    key = (date_str, amount, desc)
                    if key in existing_txs:
                        continue

                    category = categories_by_id.get(tx.get('category_id'))

                    new_tx = Transaction.objects.create(
                        user=request.user,
                        account=account,
                        transaction_type=tx['transaction_type'],
                        amount=amount,
                        description=desc,
                        date=date_obj,
                        category=category,
                        is_recurring=bool(tx.get('is_recurring', False)),
                        note='',
                        tags=[],
                    )
                    if category is None:
                        created_ids.append(new_tx.id)
                    created_transactions += 1

        if created_ids:
            try:
                apply_rules(request.user, Transaction.objects.filter(id__in=created_ids))
            except Exception:
                pass

        return Response({
            'created_accounts': created_accounts,
            'created_transactions': created_transactions,
            'skipped_ribs': skipped_ribs,
        })
