import logging
from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction
from django.utils import timezone

from apps.bank_sync.models import BankAccount, SyncLog
from apps.categories.models import Category
from apps.categories.rules import apply_rules
from apps.transactions.models import Transaction
from apps.imports.services.categorizer import suggest_category
from apps.bank_sync.services import gocardless

logger = logging.getLogger(__name__)


def _pick_description(tx: dict) -> str:
    """Extract the best available description string from a GoCardless transaction dict."""
    candidates = [
        tx.get('remittanceInformationUnstructured'),
        tx.get('remittanceInformationStructured'),
        tx.get('creditorName') if Decimal(tx.get('transactionAmount', {}).get('amount', '0')) < 0 else None,
        tx.get('debtorName') if Decimal(tx.get('transactionAmount', {}).get('amount', '0')) >= 0 else None,
        tx.get('creditorName'),
        tx.get('debtorName'),
        tx.get('additionalInformation'),
    ]
    for candidate in candidates:
        if candidate and candidate.strip():
            return candidate.strip()[:255]
    return 'Transaction bancaire'


def _is_duplicate(account_id: int, external_id: str | None, date: str, amount: Decimal, description: str) -> bool:
    """Two-tier deduplication: exact external_id match first, fuzzy fallback for null IDs."""
    if external_id:
        return Transaction.objects.filter(account_id=account_id, external_id=external_id).exists()
    return Transaction.objects.filter(
        account_id=account_id,
        date=date,
        amount=amount,
        description=description,
    ).exists()


def sync_bank_account(bank_account: BankAccount, linked_account_id: int | None = None) -> dict:
    """
    Fetch booked transactions from GoCardless and import new ones.
    Deduplicates by external_id (primary) or (date, amount, description) fallback.
    """
    from apps.accounts.models import Account

    user = bank_account.requisition.user

    if linked_account_id:
        try:
            app_account = Account.objects.get(pk=linked_account_id, user=user)
        except Account.DoesNotExist:
            raise ValueError(f'Compte {linked_account_id} introuvable ou non autorisé.')
    elif bank_account.linked_account_id:
        app_account = bank_account.linked_account
    else:
        raise ValueError('Aucun compte GestionCompte lié. Veuillez en choisir un.')

    date_from = bank_account.last_synced_at.strftime('%Y-%m-%d') if bank_account.last_synced_at else None

    try:
        result = gocardless.get_account_transactions(bank_account.account_id, date_from=date_from)
    except gocardless.GoCardlessError as exc:
        SyncLog.objects.create(
            bank_account=bank_account,
            transactions_added=0,
            status='error',
            error_message=str(exc),
        )
        raise

    booked = result.get('transactions', {}).get('booked', [])

    user_categories = {c.name.lower(): c for c in Category.objects.filter(user=user)}

    to_create = []
    seen_external_ids: set[str] = set()

    for tx in booked:
        raw_amount_str = tx.get('transactionAmount', {}).get('amount', '0')
        try:
            amount_decimal = Decimal(raw_amount_str)
        except InvalidOperation:
            logger.warning('Skipping transaction with invalid amount: %s', raw_amount_str)
            continue

        external_id = tx.get('transactionId') or tx.get('internalTransactionId') or None
        booking_date = tx.get('bookingDate') or tx.get('valueDate')
        if not booking_date:
            continue

        tx_type = 'income' if amount_decimal > 0 else 'expense'
        amount = abs(amount_decimal)

        try:
            description = _pick_description(tx)
        except (InvalidOperation, TypeError):
            description = 'Transaction bancaire'

        # Avoid processing the same external_id twice in this batch
        if external_id and external_id in seen_external_ids:
            continue

        if _is_duplicate(app_account.id, external_id, booking_date, amount, description):
            continue

        suggested_name = suggest_category(description)
        category = user_categories.get(suggested_name.lower()) if suggested_name else None

        to_create.append(Transaction(
            user=user,
            account=app_account,
            transaction_type=tx_type,
            amount=amount,
            description=description,
            date=booking_date,
            external_id=external_id,
            category=category,
            is_recurring=False,
            note='',
            tags=[],
        ))

        if external_id:
            seen_external_ids.add(external_id)

    added = 0
    created_ids: list[int] = []
    try:
        with db_transaction.atomic():
            if to_create:
                created = Transaction.objects.bulk_create(to_create, ignore_conflicts=True)
                created_ids = [tx.id for tx in created if tx.id]
                added = len(created_ids)

            bank_account.last_synced_at = timezone.now()
            bank_account.linked_account = app_account
            bank_account.save(update_fields=['last_synced_at', 'linked_account'])

        if created_ids:
            apply_rules(user, Transaction.objects.filter(id__in=created_ids))

        SyncLog.objects.create(
            bank_account=bank_account,
            transactions_added=added,
            status='success',
        )
    except Exception as exc:
        SyncLog.objects.create(
            bank_account=bank_account,
            transactions_added=0,
            status='error',
            error_message=str(exc),
        )
        raise

    return {'transactions_added': added}
