import logging
from datetime import datetime, timedelta, timezone

import requests
from decouple import config

logger = logging.getLogger(__name__)

BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2'

GOCARDLESS_SECRET_ID = config('GOCARDLESS_SECRET_ID', default='')
GOCARDLESS_SECRET_KEY = config('GOCARDLESS_SECRET_KEY', default='')


class GoCardlessError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


def _fetch_new_token() -> dict:
    """Exchange secret credentials for a new access+refresh token pair."""
    resp = requests.post(
        f'{BASE_URL}/token/new/',
        json={'secret_id': GOCARDLESS_SECRET_ID, 'secret_key': GOCARDLESS_SECRET_KEY},
        timeout=15,
    )
    if not resp.ok:
        raise GoCardlessError(f'Token request failed: {resp.text}', resp.status_code)
    return resp.json()


def _refresh_access_token(refresh_token: str) -> dict:
    """Exchange a refresh token for a new access token."""
    resp = requests.post(
        f'{BASE_URL}/token/refresh/',
        json={'refresh': refresh_token},
        timeout=15,
    )
    if not resp.ok:
        raise GoCardlessError(f'Token refresh failed: {resp.text}', resp.status_code)
    return resp.json()


def _get_access_token(force_refresh: bool = False) -> str:
    """Return a valid access token, refreshing or creating one as needed.

    Uses a DB singleton (pk=1) to share the token across Gunicorn workers.
    """
    from django.db import transaction as db_transaction
    from apps.bank_sync.models import GoCardlessToken

    now = datetime.now(tz=timezone.utc)
    buffer = timedelta(seconds=60)

    with db_transaction.atomic():
        token_obj = GoCardlessToken.objects.select_for_update().filter(pk=1).first()

        if not force_refresh and token_obj and token_obj.access_expires - buffer > now:
            return token_obj.access_token

        if token_obj and token_obj.refresh_expires - buffer > now:
            try:
                data = _refresh_access_token(token_obj.refresh_token)
                new_expires = now + timedelta(seconds=data.get('access_expires', 86400))
                GoCardlessToken.objects.filter(pk=1).update(
                    access_token=data['access'],
                    access_expires=new_expires,
                )
                return data['access']
            except GoCardlessError:
                pass

        data = _fetch_new_token()
        token_data = {
            'access_token': data['access'],
            'access_expires': now + timedelta(seconds=data.get('access_expires', 86400)),
            'refresh_token': data['refresh'],
            'refresh_expires': now + timedelta(seconds=data.get('refresh_expires', 2592000)),
        }
        obj, _ = GoCardlessToken.objects.update_or_create(pk=1, defaults=token_data)
        return obj.access_token


def _request(method: str, path: str, **kwargs) -> dict:
    token = _get_access_token()
    headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
    if method.upper() in ('POST', 'PUT', 'PATCH') and 'json' in kwargs:
        headers['Content-Type'] = 'application/json'

    url = f'{BASE_URL}{path}'
    resp = requests.request(method, url, headers=headers, timeout=20, **kwargs)

    if resp.status_code == 401:
        token = _get_access_token(force_refresh=True)
        headers['Authorization'] = f'Bearer {token}'
        resp = requests.request(method, url, headers=headers, timeout=20, **kwargs)

    if not resp.ok:
        raise GoCardlessError(f'{method} {path} failed ({resp.status_code}): {resp.text}', resp.status_code)

    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


def list_institutions(country: str = 'FR') -> list:
    return _request('GET', '/institutions/', params={'country': country})


def create_requisition(institution_id: str, redirect_uri: str, reference: str) -> dict:
    return _request('POST', '/requisitions/', json={
        'redirect': redirect_uri,
        'institution_id': institution_id,
        'reference': reference,
        'user_language': 'FR',
    })


def get_requisition(requisition_id: str) -> dict:
    return _request('GET', f'/requisitions/{requisition_id}/')


def get_account_details(account_id: str) -> dict:
    return _request('GET', f'/accounts/{account_id}/details/')


def get_account_balances(account_id: str) -> dict:
    return _request('GET', f'/accounts/{account_id}/balances/')


def get_account_transactions(account_id: str, date_from: str | None = None, date_to: str | None = None) -> dict:
    params: dict = {}
    if date_from:
        params['date_from'] = date_from
    if date_to:
        params['date_to'] = date_to
    return _request('GET', f'/accounts/{account_id}/transactions/', params=params)
