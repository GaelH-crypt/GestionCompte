# Transaction ↔ Charge fixe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de lier manuellement une transaction à une charge fixe depuis l'écran transactions, afficher le lien dans une colonne dédiée, et utiliser ce lien en priorité dans le moteur de projection pour éviter le double comptage.

**Architecture:** FK nullable `recurring_transaction` sur `Transaction` → endpoint `POST /transactions/{id}/link-recurring/` → moteur de projection vérifie les liens explicites en priorité, puis fallback heuristique. Frontend : colonne icône + `LinkRecurringModal`.

**Tech Stack:** Django/DRF (backend), React + TanStack Query + lucide-react (frontend), pytest via `docker compose exec -T backend python manage.py test`

---

## File Map

**Créer :**
- `backend/apps/transactions/migrations/0004_transaction_recurring_transaction.py`
- `frontend/src/components/transactions/LinkRecurringModal.tsx`

**Modifier :**
- `backend/apps/transactions/models.py` — ajouter FK `recurring_transaction`
- `backend/apps/transactions/serializers.py` — ajouter `recurring_transaction` + `recurring_transaction_name`
- `backend/apps/transactions/views.py` — ajouter action `link_recurring`
- `backend/apps/transactions/tests.py` — tests endpoint link
- `backend/apps/projections/engine.py` — priorité liens explicites
- `backend/apps/projections/tests.py` — test lien explicite dans engine
- `frontend/src/types/index.ts` — étendre `Transaction`
- `frontend/src/api/transactions.ts` — ajouter `linkRecurring`
- `frontend/src/pages/TransactionsPage.tsx` — colonne + bouton + modal

---

## Task 1 — Modèle : FK `recurring_transaction` sur `Transaction`

**Files:**
- Modify: `backend/apps/transactions/models.py`
- Create: `backend/apps/transactions/migrations/0004_transaction_recurring_transaction.py`

- [ ] **Step 1 — Ajouter la FK dans le modèle**

Dans `backend/apps/transactions/models.py`, après le champ `external_id` :

```python
recurring_transaction = models.ForeignKey(
    'recurring.RecurringTransaction',
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name='linked_transactions',
)
```

Le fichier complet des imports ne change pas — `models` est déjà importé.

- [ ] **Step 2 — Générer la migration**

```bash
docker compose exec -T backend python manage.py makemigrations transactions --name transaction_recurring_transaction
```

Vérifier que le fichier `0004_transaction_recurring_transaction.py` a bien été créé dans `backend/apps/transactions/migrations/`.

- [ ] **Step 3 — Appliquer la migration**

```bash
docker compose exec -T backend python manage.py migrate
```

Sortie attendue : `Applying transactions.0004_transaction_recurring_transaction... OK`

- [ ] **Step 4 — Commit**

```bash
git add backend/apps/transactions/models.py backend/apps/transactions/migrations/0004_transaction_recurring_transaction.py
git commit -m "feat(transactions): add recurring_transaction FK"
```

---

## Task 2 — Serializer : exposer le lien

**Files:**
- Modify: `backend/apps/transactions/serializers.py`

- [ ] **Step 1 — Mettre à jour le serializer**

Remplacer le contenu de `backend/apps/transactions/serializers.py` par :

```python
from rest_framework import serializers
from .models import Transaction
from apps.accounts.models import Account


class TransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    recurring_transaction_name = serializers.CharField(
        source='recurring_transaction.name', read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = Transaction
        fields = (
            'id', 'account', 'account_name', 'transaction_type', 'amount',
            'category', 'category_name', 'description', 'date', 'is_recurring',
            'note', 'tags', 'transfer_to_account', 'created_at', 'updated_at',
            'recurring_transaction', 'recurring_transaction_name',
        )
        read_only_fields = (
            'id', 'created_at', 'updated_at', 'category_name', 'account_name',
            'recurring_transaction_name',
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            user_accounts = Account.objects.filter(user=request.user)
            self.fields['account'].queryset = user_accounts
            self.fields['transfer_to_account'].queryset = user_accounts

    def validate(self, data):
        if data.get('transaction_type') == 'transfer' and not data.get('transfer_to_account'):
            raise serializers.ValidationError({'transfer_to_account': 'Requis pour les virements.'})
        if data.get('amount', 0) <= 0:
            raise serializers.ValidationError({'amount': 'Le montant doit être positif.'})
        return data

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
```

- [ ] **Step 2 — Vérifier que les tests existants passent**

```bash
docker compose exec -T backend python manage.py test apps.transactions --verbosity=2
```

Sortie attendue : tous les tests passent (OK).

- [ ] **Step 3 — Commit**

```bash
git add backend/apps/transactions/serializers.py
git commit -m "feat(transactions): expose recurring_transaction fields in serializer"
```

---

## Task 3 — Endpoint `link-recurring`

**Files:**
- Modify: `backend/apps/transactions/views.py`
- Modify: `backend/apps/transactions/tests.py`

- [ ] **Step 1 — Écrire les tests (TDD)**

Ajouter à la fin de `backend/apps/transactions/tests.py` :

```python
from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient


class LinkRecurringViewTest(TestCase):
    def setUp(self):
        from apps.accounts.models import Account
        from apps.recurring.models import RecurringTransaction
        from apps.transactions.models import Transaction

        self.client = APIClient()
        self.user = User.objects.create_user(username='u', password='pw')
        self.client.force_authenticate(self.user)

        self.account = Account.objects.create(
            user=self.user, name='CCP', account_type='checking', initial_balance=Decimal('0'),
        )
        self.rt = RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Loyer',
            amount=Decimal('915'), transaction_type='expense',
            frequency='monthly', next_occurrence=date(2026, 5, 2),
        )
        self.tx = Transaction.objects.create(
            user=self.user, account=self.account, transaction_type='expense',
            amount=Decimal('915'), description='Loyer juin', date=date(2026, 6, 1),
        )

    def _url(self, tx_id):
        return f'/transactions/{tx_id}/link-recurring/'

    def test_link_sets_fk_and_advances_next_occurrence(self):
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': self.rt.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.tx.refresh_from_db()
        self.rt.refresh_from_db()
        self.assertEqual(self.tx.recurring_transaction_id, self.rt.id)
        # tx.date (2026-06-01) >= rt.next_occurrence (2026-05-02) → advance by 1 month
        self.assertEqual(self.rt.next_occurrence, date(2026, 7, 1))

    def test_link_null_removes_fk(self):
        self.tx.recurring_transaction = self.rt
        self.tx.save()
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': None}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.tx.refresh_from_db()
        self.assertIsNone(self.tx.recurring_transaction_id)

    def test_type_mismatch_returns_400(self):
        from apps.recurring.models import RecurringTransaction
        rt_income = RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Salaire',
            amount=Decimal('2000'), transaction_type='income',
            frequency='monthly', next_occurrence=date(2026, 6, 27),
        )
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': rt_income.id}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_link_other_user_recurring_returns_404(self):
        other = User.objects.create_user(username='other', password='pw')
        from apps.accounts.models import Account
        from apps.recurring.models import RecurringTransaction
        other_account = Account.objects.create(
            user=other, name='Autre', account_type='checking', initial_balance=Decimal('0'),
        )
        other_rt = RecurringTransaction.objects.create(
            user=other, account=other_account, name='Loyer autre',
            amount=Decimal('500'), transaction_type='expense',
            frequency='monthly', next_occurrence=date(2026, 6, 1),
        )
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': other_rt.id}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_next_occurrence_not_advanced_when_tx_before_next_occ(self):
        from apps.recurring.models import RecurringTransaction
        rt = RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Futur',
            amount=Decimal('200'), transaction_type='expense',
            frequency='monthly', next_occurrence=date(2026, 7, 1),
        )
        from apps.transactions.models import Transaction
        tx_early = Transaction.objects.create(
            user=self.user, account=self.account, transaction_type='expense',
            amount=Decimal('200'), description='Paiement anticipé', date=date(2026, 6, 15),
        )
        resp = self.client.post(self._url(tx_early.id), {'recurring_id': rt.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        rt.refresh_from_db()
        # tx.date (2026-06-15) < rt.next_occurrence (2026-07-01) → pas d'avance
        self.assertEqual(rt.next_occurrence, date(2026, 7, 1))
```

- [ ] **Step 2 — Lancer les tests pour vérifier qu'ils échouent**

```bash
docker compose exec -T backend python manage.py test apps.transactions.tests.LinkRecurringViewTest --verbosity=2
```

Sortie attendue : erreurs 404 (endpoint inexistant).

- [ ] **Step 3 — Implémenter l'action dans la view**

Remplacer le contenu de `backend/apps/transactions/views.py` par :

```python
from dateutil.relativedelta import relativedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Transaction
from .serializers import TransactionSerializer
from .filters import TransactionFilter


_FREQ_STEP = {
    'weekly': relativedelta(weeks=1),
    'monthly': relativedelta(months=1),
    'yearly': relativedelta(years=1),
}


class TransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    search_fields = ['description', 'note']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date']

    def get_queryset(self):
        return (
            Transaction.objects
            .filter(user=self.request.user)
            .select_related('account', 'category', 'recurring_transaction')
        )

    @action(detail=False, methods=['get'], url_path='detect-recurring')
    def detect_recurring(self, request):
        from .detection import detect_recurring_suggestions
        return Response(detect_recurring_suggestions(request.user))

    @action(detail=True, methods=['post'], url_path='link-recurring')
    def link_recurring(self, request, pk=None):
        from apps.recurring.models import RecurringTransaction

        tx = self.get_object()
        recurring_id = request.data.get('recurring_id')

        if recurring_id is None:
            tx.recurring_transaction = None
            tx.save(update_fields=['recurring_transaction'])
            return Response(TransactionSerializer(tx, context={'request': request}).data)

        try:
            rt = RecurringTransaction.objects.get(id=recurring_id, user=request.user, is_active=True)
        except RecurringTransaction.DoesNotExist:
            return Response({'detail': 'Charge fixe introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if rt.transaction_type != tx.transaction_type:
            return Response(
                {'detail': 'Le type de la charge fixe ne correspond pas à la transaction.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tx.recurring_transaction = rt
        tx.save(update_fields=['recurring_transaction'])

        if tx.date >= rt.next_occurrence:
            step = _FREQ_STEP.get(rt.frequency)
            if step:
                # Avancer à partir de tx.date (pas de next_occurrence) pour garantir
                # que la nouvelle échéance est bien dans le mois suivant le paiement.
                rt.next_occurrence = tx.date + step
                rt.save(update_fields=['next_occurrence'])

        return Response(TransactionSerializer(tx, context={'request': request}).data)
```

- [ ] **Step 4 — Lancer les tests**

```bash
docker compose exec -T backend python manage.py test apps.transactions.tests.LinkRecurringViewTest --verbosity=2
```

Sortie attendue : 5 tests, OK.

- [ ] **Step 5 — Lancer tous les tests transactions**

```bash
docker compose exec -T backend python manage.py test apps.transactions --verbosity=2
```

Sortie attendue : OK.

- [ ] **Step 6 — Commit**

```bash
git add backend/apps/transactions/views.py backend/apps/transactions/tests.py
git commit -m "feat(transactions): add link-recurring endpoint with next_occurrence advancement"
```

---

## Task 4 — Engine : liens explicites en priorité

**Files:**
- Modify: `backend/apps/projections/engine.py`
- Modify: `backend/apps/projections/tests.py`

- [ ] **Step 1 — Écrire le test pour le chemin lien explicite**

Ajouter dans `BuildEngineFromUserTest` (dans `backend/apps/projections/tests.py`), après le test existant :

```python
def test_explicit_link_takes_priority_over_heuristic(self):
    """Une transaction liée explicitement doit protéger contre le double-comptage
    même si le montant diffère (cas nounou, montant variable)."""
    from apps.transactions.models import Transaction
    today = date.today()
    # Recurring à 300€ mais paiement réel à 285€ (montant variable)
    from apps.recurring.models import RecurringTransaction
    rt_nounou = RecurringTransaction.objects.create(
        user=self.user,
        account=self.account,
        name='Nounou',
        amount=Decimal('300.00'),
        transaction_type='expense',
        frequency='monthly',
        next_occurrence=(today.replace(day=1) - relativedelta(months=1)).replace(day=5),
    )
    tx_nounou = Transaction.objects.create(
        user=self.user,
        account=self.account,
        transaction_type='expense',
        amount=Decimal('285.00'),  # montant différent du recurring
        description='Paiement nounou juin',
        date=today.replace(day=1),
    )
    tx_nounou.recurring_transaction = rt_nounou
    tx_nounou.save()

    from apps.projections.engine import build_engine_from_user
    engine = build_engine_from_user(self.user)

    # L'occurrence de rt_nounou dans le mois courant doit être skippée via lien explicite
    nounou_events_this_month = [
        e for e in engine.daily_events
        if e['amount'] == Decimal('300.00')
        and e['date'].year == today.year
        and e['date'].month == today.month
    ]
    self.assertEqual(
        len(nounou_events_this_month), 0,
        "La nounou ne doit pas apparaître dans le mois courant via le lien explicite",
    )
```

- [ ] **Step 2 — Lancer le test pour vérifier qu'il échoue**

```bash
docker compose exec -T backend python manage.py test apps.projections.tests.BuildEngineFromUserTest.test_explicit_link_takes_priority_over_heuristic --verbosity=2
```

Sortie attendue : FAIL (le test passe à tort car le lien n'est pas encore géré).

- [ ] **Step 3 — Mettre à jour le moteur de projection**

Dans `backend/apps/projections/engine.py`, localiser le bloc qui commence par `# Pre-fetch transactions from the current month` (ajouté par le fix précédent) et remplacer **tout ce bloc jusqu'à la fin de la condition de skip** par :

```python
    # Pre-fetch transactions from the current month to detect recurring charges that
    # were already paid via import. Two detection layers:
    # 1. Explicit link (recurring_transaction FK) — takes priority, works even when
    #    amounts differ (e.g. variable childcare payments).
    # 2. Heuristic (amount + type + account) — fallback for unlinked transactions.
    from apps.transactions.models import Transaction as _Tx
    first_of_month = today.replace(day=1)
    _qs = _Tx.objects.filter(user=user, date__gte=first_of_month, date__lte=today)
    _linked_this_month = set(
        _qs.filter(recurring_transaction__isnull=False)
        .values_list('recurring_transaction_id', flat=True)
    )
    _paid_this_month = set(
        _qs.values_list('amount', 'transaction_type', 'account_id')
    )
```

Puis localiser la condition de skip dans la boucle `daily_events` (le bloc `if occ.year == today.year ...`) et le remplacer par :

```python
        # If the next occurrence falls in the current calendar month, check whether
        # it has already been paid:
        # 1. Explicit link (priority — handles variable amounts like childcare).
        # 2. Heuristic amount+type+account fallback for unlinked transactions.
        if occ.year == today.year and occ.month == today.month:
            if (
                rt.id in _linked_this_month
                or (rt.amount, rt.transaction_type, rt.account_id) in _paid_this_month
            ):
                occ = occ + step
```

Le fichier complet de `build_engine_from_user` après modification (section daily_events uniquement, pour référence) doit ressembler à :

```python
    daily_end = today + timedelta(days=62)
    daily_events = []

    from apps.transactions.models import Transaction as _Tx
    first_of_month = today.replace(day=1)
    _qs = _Tx.objects.filter(user=user, date__gte=first_of_month, date__lte=today)
    _linked_this_month = set(
        _qs.filter(recurring_transaction__isnull=False)
        .values_list('recurring_transaction_id', flat=True)
    )
    _paid_this_month = set(
        _qs.values_list('amount', 'transaction_type', 'account_id')
    )

    _freq_step = {
        'weekly': relativedelta(weeks=1),
        'monthly': relativedelta(months=1),
        'yearly': relativedelta(years=1),
    }
    for rt in RecurringTransaction.objects.filter(user=user, is_active=True):
        step = _freq_step.get(rt.frequency)
        if step is None:
            continue
        kind = 'income' if rt.transaction_type == 'income' else 'expenses'
        occ = rt.next_occurrence
        while occ <= today:
            occ = occ + step
        if occ.year == today.year and occ.month == today.month:
            if (
                rt.id in _linked_this_month
                or (rt.amount, rt.transaction_type, rt.account_id) in _paid_this_month
            ):
                occ = occ + step
        while occ <= daily_end:
            daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind, 'label': rt.name})
            occ = occ + step
```

- [ ] **Step 4 — Lancer tous les tests projections**

```bash
docker compose exec -T backend python manage.py test apps.projections --verbosity=2
```

Sortie attendue : 11 tests, OK.

- [ ] **Step 5 — Commit**

```bash
git add backend/apps/projections/engine.py backend/apps/projections/tests.py
git commit -m "feat(projections): use explicit recurring link as priority in double-count detection"
```

---

## Task 5 — Frontend : types et API

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/transactions.ts`

- [ ] **Step 1 — Étendre l'interface `Transaction`**

Dans `frontend/src/types/index.ts`, ajouter deux champs à la fin de l'interface `Transaction` (avant la fermeture `}`) :

```ts
  recurring_transaction: number | null
  recurring_transaction_name: string | null
```

- [ ] **Step 2 — Ajouter la méthode API**

Dans `frontend/src/api/transactions.ts`, ajouter dans l'objet `transactionsApi` :

```ts
  linkRecurring: (txId: number, recurringId: number | null) =>
    client.post<Transaction>(`/transactions/${txId}/link-recurring/`, { recurring_id: recurringId }),
```

- [ ] **Step 3 — Vérifier la compilation TypeScript**

```bash
docker compose exec -T frontend npx tsc --noEmit
```

Sortie attendue : aucune erreur.

- [ ] **Step 4 — Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/transactions.ts
git commit -m "feat(frontend): add recurring_transaction fields to Transaction type and linkRecurring API"
```

---

## Task 6 — Frontend : `LinkRecurringModal`

**Files:**
- Create: `frontend/src/components/transactions/LinkRecurringModal.tsx`

- [ ] **Step 1 — Créer le composant**

Créer `frontend/src/components/transactions/LinkRecurringModal.tsx` :

```tsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Link2, Unlink } from 'lucide-react'
import { recurringApi } from '@/api/recurring'
import { transactionsApi } from '@/api/transactions'
import { Button } from '@/components/ui/Button'
import type { Transaction } from '@/types'

interface Props {
  transaction: Transaction
  onClose: () => void
}

export function LinkRecurringModal({ transaction, onClose }: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(
    transaction.recurring_transaction
  )

  const { data: recurringData } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })

  const filtered = useMemo(() => {
    const list = (recurringData ?? []).filter(
      (rt) => rt.is_active && rt.transaction_type === transaction.transaction_type
    )
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((rt) => rt.name.toLowerCase().includes(q))
  }, [recurringData, search, transaction.transaction_type])

  const linkMut = useMutation({
    mutationFn: (recurringId: number | null) =>
      transactionsApi.linkRecurring(transaction.id, recurringId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['projections'] })
      onClose()
    },
  })

  const sel =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Lier à une charge fixe</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>

        <p className="text-xs text-gray-500 -mt-2">
          Transaction : <span className="text-gray-300">{transaction.description}</span>
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une charge fixe…"
            className={`${sel} pl-9 w-full`}
          />
        </div>

        <div className="overflow-y-auto max-h-64 flex flex-col gap-1">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Aucune charge fixe compatible.</p>
          )}
          {filtered.map((rt) => (
            <button
              key={rt.id}
              onClick={() => setSelectedId(rt.id === selectedId ? null : rt.id)}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                selectedId === rt.id
                  ? 'bg-brand-500/20 border border-brand-500/40'
                  : 'bg-gray-800/40 hover:bg-gray-800 border border-transparent'
              }`}
            >
              <Link2 className={`h-4 w-4 flex-shrink-0 ${selectedId === rt.id ? 'text-brand-400' : 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-100 truncate">{rt.name}</p>
                <p className="text-xs text-gray-500">{rt.frequency === 'monthly' ? 'Mensuel' : rt.frequency === 'weekly' ? 'Hebdo' : 'Annuel'}</p>
              </div>
              <span className="text-sm font-semibold text-red-400 whitespace-nowrap">
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(rt.amount))}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
          {transaction.recurring_transaction && (
            <Button
              variant="secondary"
              onClick={() => linkMut.mutate(null)}
              loading={linkMut.isPending}
              className="w-full"
            >
              <Unlink className="h-4 w-4" /> Retirer le lien
            </Button>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button
              onClick={() => linkMut.mutate(selectedId)}
              loading={linkMut.isPending}
              disabled={selectedId === transaction.recurring_transaction}
              className="flex-1"
            >
              Lier
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 — Vérifier la compilation TypeScript**

```bash
docker compose exec -T frontend npx tsc --noEmit
```

Sortie attendue : aucune erreur.

- [ ] **Step 3 — Commit**

```bash
git add frontend/src/components/transactions/LinkRecurringModal.tsx
git commit -m "feat(transactions): add LinkRecurringModal component"
```

---

## Task 7 — Frontend : colonne + bouton dans `TransactionsPage`

**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`

- [ ] **Step 1 — Mettre à jour `TransactionsPage.tsx`**

**1a. Ajouter l'import en haut du fichier** (après les imports lucide existants) :

```tsx
import { Link2 } from 'lucide-react'
import { LinkRecurringModal } from '@/components/transactions/LinkRecurringModal'
```

**1b. Ajouter `'recurring'` à `ColKey`** (ligne `type ColKey = ...`) :

```tsx
type ColKey = 'icon' | 'description' | 'account' | 'category' | 'recurring' | 'date' | 'amount' | 'actions'
```

**1c. Ajouter la colonne dans `COLUMNS`** (après `category`) :

```tsx
  { key: 'recurring', label: '', width: 36, resizable: false },
```

**1d. Ajouter l'état pour la modal** dans `TransactionsPage()` (après `const [page, setPage] = useState(1)`) :

```tsx
  const [linkingTx, setLinkingTx] = useState<Transaction | null>(null)
```

**1e. Ajouter la cellule dans la ligne de tableau** (après la cellule `category`, avant la cellule `date`) :

```tsx
                  <td className="px-2 py-3 text-center">
                    {tx.recurring_transaction_name && (
                      <Link2
                        className="h-3.5 w-3.5 text-brand-500 mx-auto"
                        title={tx.recurring_transaction_name}
                      />
                    )}
                  </td>
```

**1f. Ajouter le bouton de lien dans la colonne actions** (avant le bouton crayon) :

```tsx
                      <button
                        onClick={() => setLinkingTx(tx)}
                        className={`p-1.5 rounded-lg ${
                          tx.recurring_transaction
                            ? 'text-brand-500 hover:bg-brand-500/10'
                            : 'text-gray-500 hover:text-white hover:bg-gray-800'
                        }`}
                        title={tx.recurring_transaction_name ?? 'Lier à une charge fixe'}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
```

**1g. Ajouter la badge dans les cartes mobiles** (après la ligne account/category, avant le bloc `justify-end`) :

```tsx
            {tx.recurring_transaction_name && (
              <span className="text-xs text-brand-400 pl-6">
                🔗 {tx.recurring_transaction_name}
              </span>
            )}
```

**1h. Ajouter la modal en bas du JSX** (avant la fermeture de `</div>` finale, après `<ImportWizard>`) :

```tsx
      {linkingTx && (
        <LinkRecurringModal
          transaction={linkingTx}
          onClose={() => setLinkingTx(null)}
        />
      )}
```

**1i. Mettre à jour `colSpan` du message "aucune transaction"** : passer de `7` à `8` (une colonne de plus).

- [ ] **Step 2 — Vérifier la compilation TypeScript**

```bash
docker compose exec -T frontend npx tsc --noEmit
```

Sortie attendue : aucune erreur.

- [ ] **Step 3 — Commit**

```bash
git add frontend/src/pages/TransactionsPage.tsx
git commit -m "feat(transactions): add recurring column, link button, and LinkRecurringModal integration"
```

---

## Task 8 — Vérification finale

- [ ] **Step 1 — Lancer tous les tests backend**

```bash
docker compose exec -T backend python manage.py test --verbosity=2
```

Sortie attendue : tous les tests passent (OK).

- [ ] **Step 2 — Vérifier TypeScript**

```bash
docker compose exec -T frontend npx tsc --noEmit
```

Sortie attendue : aucune erreur.

- [ ] **Step 3 — Tester manuellement le golden path**

1. Ouvrir l'app → page Transactions
2. Cliquer sur l'icône `Link2` d'une transaction expense (ex: loyer)
3. Vérifier que la liste filtre bien les charges fixes de type `expense`
4. Chercher "loyer" dans la recherche → résultat filtré
5. Cliquer sur une charge fixe → highlight brand
6. Cliquer "Lier" → modal se ferme, icône `Link2` bleue apparaît dans la colonne
7. Survoler l'icône → tooltip avec le nom de la charge fixe
8. Rouvrir le modal → "Retirer le lien" visible
9. Cliquer "Retirer le lien" → icône disparaît
10. Sur mobile : vérifier que le badge `🔗 Nom` apparaît/disparaît correctement

- [ ] **Step 4 — Commit final si ajustements cosmétiques**

```bash
git add -p
git commit -m "fix(transactions): post-review cosmetic adjustments"
```
