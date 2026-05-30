# Detect Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton "Détecter les récurrentes" dans la page Transactions qui analyse l'historique, trouve les patterns périodiques, et propose à l'utilisateur de les ajouter comme `RecurringTransaction`.

**Architecture:** Un endpoint DRF `GET /api/transactions/detect-recurring/` implémenté comme `@action` sur le viewset existant. La logique de détection est isolée dans `detection.py`. Le frontend ajoute un bouton qui ouvre une modale listant les suggestions avec les actions Ajouter / Ignorer.

**Tech Stack:** Django/DRF (backend), React + TypeScript + TanStack Query (frontend), dateutil (déjà installé), Lucide icons.

---

## Fichiers

| Action | Fichier |
|--------|---------|
| Créer | `backend/apps/transactions/detection.py` |
| Modifier | `backend/apps/transactions/views.py` |
| Modifier | `backend/apps/transactions/tests.py` |
| Modifier | `frontend/src/types/index.ts` |
| Modifier | `frontend/src/api/transactions.ts` |
| Modifier | `frontend/src/pages/TransactionsPage.tsx` |

---

## Task 1 — Algorithme de détection (backend)

**Fichiers :**
- Créer : `backend/apps/transactions/detection.py`
- Modifier : `backend/apps/transactions/tests.py`

- [ ] **Écrire les tests (failing)**

Ajouter à la fin de `backend/apps/transactions/tests.py` :

```python
from datetime import date as dt
from apps.transactions.detection import detect_recurring_suggestions


class DetectRecurringTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('detectuser', password='pass')
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )

    def _tx(self, description, amount, tx_type, date_str):
        from apps.transactions.models import Transaction
        return Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type=tx_type, amount=amount,
            description=description, date=date_str,
        )

    def test_monthly_pattern_detected(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('PRLV SEPA ORANGE SA ABONNEMENT', '24.99', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]['frequency'], 'monthly')
        self.assertEqual(suggestions[0]['occurrence_count'], 3)
        self.assertEqual(suggestions[0]['transaction_type'], 'expense')

    def test_weekly_pattern_detected(self):
        for d in ['2026-01-07', '2026-01-14', '2026-01-21']:
            self._tx('COURSES LIDL', '45.00', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]['frequency'], 'weekly')

    def test_irregular_interval_excluded(self):
        # 50-day interval — no frequency match
        self._tx('RANDOM CHARGE', '50.00', 'expense', '2026-01-01')
        self._tx('RANDOM CHARGE', '50.00', 'expense', '2026-02-20')
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_single_occurrence_excluded(self):
        self._tx('ONLY ONCE', '10.00', 'expense', '2026-01-15')
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_already_covered_excluded(self):
        from apps.recurring.models import RecurringTransaction
        RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Orange',
            amount='24.99', transaction_type='expense',
            frequency='monthly', next_occurrence='2026-06-15',
        )
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('PRLV SEPA ORANGE SA', '24.99', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_variable_description_groups_together(self):
        # Trailing reference numbers should not prevent grouping
        self._tx('VIR SALAIRE ENTREPRISE REF20260115', '2000.00', 'income', '2026-01-15')
        self._tx('VIR SALAIRE ENTREPRISE REF20260215', '2000.00', 'income', '2026-02-15')
        self._tx('VIR SALAIRE ENTREPRISE REF20260315', '2000.00', 'income', '2026-03-15')
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]['frequency'], 'monthly')

    def test_transfer_type_excluded(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('VIR INTERNE', '500.00', 'transfer', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_sorted_by_occurrence_count(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']:
            self._tx('FREQUENT CHARGE', '10.00', 'expense', d)
        for d in ['2026-01-20', '2026-02-20', '2026-03-20']:
            self._tx('LESS FREQUENT', '20.00', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertGreaterEqual(suggestions[0]['occurrence_count'], suggestions[1]['occurrence_count'])
```

- [ ] **Lancer les tests — vérifier qu'ils échouent**

```bash
cd /DATA/AppData/gestioncompte/backend
docker exec gestioncompte-backend-1 python manage.py test apps.transactions.tests.DetectRecurringTest -v 2
```

Résultat attendu : `ImportError` ou `ModuleNotFoundError` sur `detection`.

- [ ] **Créer `backend/apps/transactions/detection.py`**

```python
import re
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import median

from dateutil.relativedelta import relativedelta


def normalize_description(description: str) -> str:
    desc = description.lower()
    desc = re.sub(r'\d{4,}', '', desc)
    desc = re.sub(r'\s+', ' ', desc).strip()
    return desc[:40]


def detect_recurring_suggestions(user) -> list:
    from apps.transactions.models import Transaction
    from apps.recurring.models import RecurringTransaction

    rows = list(
        Transaction.objects
        .filter(user=user, transaction_type__in=['income', 'expense'])
        .values('description', 'amount', 'transaction_type', 'date', 'account_id')
    )

    covered = set(
        RecurringTransaction.objects
        .filter(user=user, is_active=True)
        .values_list('amount', 'transaction_type')
    )

    groups: dict = defaultdict(list)
    for row in rows:
        key = (
            normalize_description(row['description']),
            row['amount'],
            row['transaction_type'],
        )
        groups[key].append(row)

    suggestions = []
    for (norm_name, amount, tx_type), txs in groups.items():
        if len(txs) < 2:
            continue
        if (amount, tx_type) in covered:
            continue

        dates = sorted(tx['date'] for tx in txs)
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        if not intervals:
            continue

        med = median(intervals)

        if 5 <= med <= 10:
            frequency = 'weekly'
        elif 25 <= med <= 35:
            frequency = 'monthly'
        elif 340 <= med <= 390:
            frequency = 'yearly'
        else:
            continue

        last_date = dates[-1]
        if frequency == 'weekly':
            next_occ = last_date + timedelta(days=7)
        elif frequency == 'monthly':
            next_occ = last_date + relativedelta(months=1)
        else:
            next_occ = last_date + relativedelta(years=1)

        account_id = max(
            {tx['account_id'] for tx in txs},
            key=lambda a: sum(1 for tx in txs if tx['account_id'] == a),
        )

        suggestions.append({
            'name': norm_name.title(),
            'amount': str(amount),
            'transaction_type': tx_type,
            'frequency': frequency,
            'next_occurrence': next_occ.isoformat(),
            'occurrence_count': len(txs),
            'last_date': last_date.isoformat(),
            'account': account_id,
        })

    suggestions.sort(key=lambda s: s['occurrence_count'], reverse=True)
    return suggestions[:20]
```

- [ ] **Lancer les tests — vérifier qu'ils passent**

```bash
docker exec gestioncompte-backend-1 python manage.py test apps.transactions.tests.DetectRecurringTest -v 2
```

Résultat attendu : `OK` (8 tests).

- [ ] **Commit**

```bash
git add backend/apps/transactions/detection.py backend/apps/transactions/tests.py
git commit -m "feat(transactions): algorithme de détection des patterns récurrents"
```

---

## Task 2 — Endpoint API (backend)

**Fichiers :**
- Modifier : `backend/apps/transactions/views.py`

- [ ] **Écrire le test de l'endpoint (failing)**

Ajouter à la fin de `backend/apps/transactions/tests.py` :

```python
class DetectRecurringEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('endpointuser', password='pass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )

    def _tx(self, description, amount, tx_type, date_str):
        from apps.transactions.models import Transaction
        return Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type=tx_type, amount=amount,
            description=description, date=date_str,
        )

    def test_endpoint_returns_suggestions(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('PRLV SEPA ORANGE', '24.99', 'expense', d)
        resp = self.client.get('/api/transactions/detect-recurring/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['frequency'], 'monthly')

    def test_endpoint_requires_authentication(self):
        unauth = APIClient()
        resp = unauth.get('/api/transactions/detect-recurring/')
        self.assertEqual(resp.status_code, 401)

    def test_endpoint_isolates_by_user(self):
        other = User.objects.create_user('otheruser2', password='pass')
        other_account = Account.objects.create(
            user=other, name='Other', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )
        from apps.transactions.models import Transaction
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            Transaction.objects.create(
                user=other, account=other_account,
                transaction_type='expense', amount='99.99',
                description='OTHER USER TX', date=d,
            )
        resp = self.client.get('/api/transactions/detect-recurring/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 0)
```

- [ ] **Lancer les tests — vérifier qu'ils échouent**

```bash
docker exec gestioncompte-backend-1 python manage.py test apps.transactions.tests.DetectRecurringEndpointTest -v 2
```

Résultat attendu : `404` sur l'URL.

- [ ] **Ajouter l'action au viewset dans `backend/apps/transactions/views.py`**

```python
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Transaction
from .serializers import TransactionSerializer
from .filters import TransactionFilter


class TransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    search_fields = ['description', 'note']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date']

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user).select_related('account', 'category')

    @action(detail=False, methods=['get'], url_path='detect-recurring')
    def detect_recurring(self, request):
        from .detection import detect_recurring_suggestions
        return Response(detect_recurring_suggestions(request.user))
```

- [ ] **Lancer les tests — vérifier qu'ils passent**

```bash
docker exec gestioncompte-backend-1 python manage.py test apps.transactions.tests.DetectRecurringEndpointTest -v 2
```

Résultat attendu : `OK` (3 tests).

- [ ] **Lancer toute la suite transactions**

```bash
docker exec gestioncompte-backend-1 python manage.py test apps.transactions -v 2
```

Résultat attendu : tous les tests passent.

- [ ] **Commit**

```bash
git add backend/apps/transactions/views.py backend/apps/transactions/tests.py
git commit -m "feat(transactions): endpoint GET detect-recurring/"
```

---

## Task 3 — Type et méthode API (frontend)

**Fichiers :**
- Modifier : `frontend/src/types/index.ts`
- Modifier : `frontend/src/api/transactions.ts`

- [ ] **Ajouter le type `RecurringSuggestion` dans `frontend/src/types/index.ts`**

Ajouter après le bloc `// ─── Recurring ───` (après la définition de `RecurringTransaction`) :

```typescript
export interface RecurringSuggestion {
  name: string
  amount: string
  transaction_type: 'income' | 'expense'
  frequency: Frequency
  next_occurrence: string
  occurrence_count: number
  last_date: string
  account: number
}
```

- [ ] **Ajouter `detectRecurring` dans `frontend/src/api/transactions.ts`**

```typescript
import client from './client'
import type { Transaction, PaginatedResponse, RecurringSuggestion } from '@/types'

export const transactionsApi = {
  list: (params?: Record<string, string | number>) =>
    client.get<PaginatedResponse<Transaction>>('/transactions/', { params }),
  get: (id: number) =>
    client.get<Transaction>(`/transactions/${id}/`),
  create: (data: Partial<Transaction>) =>
    client.post<Transaction>('/transactions/', data),
  update: (id: number, data: Partial<Transaction>) =>
    client.patch<Transaction>(`/transactions/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/transactions/${id}/`),
  detectRecurring: () =>
    client.get<RecurringSuggestion[]>('/transactions/detect-recurring/'),
}
```

- [ ] **Vérifier la compilation TypeScript**

```bash
cd /DATA/AppData/gestioncompte/frontend
docker exec gestioncompte-frontend-1 npx tsc --noEmit 2>/dev/null || npm run type-check 2>/dev/null || echo "check manually"
```

- [ ] **Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/transactions.ts
git commit -m "feat(transactions): type RecurringSuggestion et méthode detectRecurring"
```

---

## Task 4 — Modale + bouton (frontend)

**Fichiers :**
- Modifier : `frontend/src/pages/TransactionsPage.tsx`

- [ ] **Ajouter l'import et le state dans `TransactionsPage`**

En haut des imports de `TransactionsPage.tsx`, mettre à jour l'import React pour inclure `useEffect` :

```typescript
import { useState, useEffect } from 'react'
```

Ajouter `RefreshCw` à la ligne Lucide :

```typescript
import {
  Plus, Trash2, Pencil, Search, Upload,
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, RefreshCw,
} from 'lucide-react'
```

Ajouter `RecurringSuggestion` au type import :

```typescript
import type { Transaction, TransactionType, Frequency, RecurringSuggestion } from '@/types'
```

Dans la fonction `TransactionsPage`, ajouter après les autres `useState` :

```typescript
const [showDetect, setShowDetect] = useState(false)
```

- [ ] **Ajouter le bouton dans la barre d'outils**

Remplacer le bloc `<div className="flex gap-2">` de la barre d'outils (qui contient Importer et Nouvelle transaction) par :

```tsx
<div className="flex gap-2">
  <Button variant="secondary" onClick={() => setShowImport(true)}>
    <Upload className="h-4 w-4" /> Importer
  </Button>
  <Button variant="secondary" onClick={() => setShowDetect(true)}>
    <RefreshCw className="h-4 w-4" /> Détecter les récurrentes
  </Button>
  <Button onClick={() => { setEditing(null); setShowForm(true) }}>
    <Plus className="h-4 w-4" /> Nouvelle transaction
  </Button>
</div>
```

- [ ] **Monter la modale dans le JSX de `TransactionsPage`**

Juste après le bloc `{showForm && (...)}` et avant `<ImportWizard .../>`, ajouter :

```tsx
{showDetect && (
  <DetectRecurringModal onClose={() => setShowDetect(false)} />
)}
```

- [ ] **Ajouter le composant `DetectRecurringModal` à la fin du fichier**

Ajouter après la fonction `TransactionFormModal` :

```tsx
function DetectRecurringModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<number | null>(null)

  useEffect(() => {
    transactionsApi.detectRecurring()
      .then((r) => setSuggestions(r.data))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(s: RecurringSuggestion, idx: number) {
    setAdding(idx)
    try {
      await recurringApi.create({
        name: s.name,
        amount: s.amount,
        transaction_type: s.transaction_type,
        frequency: s.frequency,
        next_occurrence: s.next_occurrence,
        account: s.account,
      })
      qc.invalidateQueries({ queryKey: ['recurring'] })
      qc.invalidateQueries({ queryKey: ['projections'] })
      setSuggestions((prev) => prev!.filter((_, i) => i !== idx))
    } finally {
      setAdding(null)
    }
  }

  function handleIgnore(idx: number) {
    setSuggestions((prev) => prev!.filter((_, i) => i !== idx))
  }

  const FREQ_LABELS: Record<Frequency, string> = {
    weekly: 'Hebdo',
    monthly: 'Mensuel',
    yearly: 'Annuel',
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[85vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Transactions récurrentes détectées</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>

        {loading && (
          <p className="text-sm text-gray-400 text-center py-8">Analyse en cours…</p>
        )}

        {!loading && suggestions !== null && suggestions.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            Aucun nouveau pattern détecté. Tous vos flux récurrents sont déjà enregistrés.
          </p>
        )}

        {!loading && suggestions !== null && suggestions.length > 0 && (
          <div className="overflow-y-auto flex flex-col gap-2">
            <p className="text-xs text-gray-500">{suggestions.length} pattern{suggestions.length > 1 ? 's' : ''} trouvé{suggestions.length > 1 ? 's' : ''}</p>
            {suggestions.map((s, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 bg-gray-800/50 rounded-xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {FREQ_LABELS[s.frequency]} · {s.occurrence_count} occurrences
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold whitespace-nowrap ${
                    s.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {s.transaction_type === 'income' ? '+' : '-'}
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(s.amount))}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleAdd(s, idx)}
                    disabled={adding === idx}
                    className="px-3 py-1 text-xs font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {adding === idx ? '…' : 'Ajouter'}
                  </button>
                  <button
                    onClick={() => handleIgnore(idx)}
                    className="px-3 py-1 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="secondary" onClick={onClose} className="mt-2">
          Fermer
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Vérifier que l'app compile sans erreur TypeScript**

```bash
cd /DATA/AppData/gestioncompte/frontend
npx tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Tester manuellement dans le navigateur**

1. Ouvrir `http://localhost:8085`
2. Aller sur la page Transactions
3. Cliquer "Détecter les récurrentes"
4. Vérifier que la modale s'ouvre avec les suggestions
5. Cliquer "Ajouter" sur une suggestion → vérifier qu'elle disparaît de la liste
6. Aller sur la page Transactions récurrentes → vérifier que l'entrée y figure
7. Revenir sur Transactions → cliquer "Détecter les récurrentes" → la suggestion ajoutée ne doit plus apparaître
8. Cliquer "Ignorer" → la suggestion doit disparaître de la liste (sans être créée)

- [ ] **Commit**

```bash
git add frontend/src/pages/TransactionsPage.tsx
git commit -m "feat(transactions): bouton et modale de détection des transactions récurrentes"
```

---

## Task 5 — Rebuild et vérification finale

- [ ] **Rebuild le frontend dans Docker**

```bash
docker exec gestioncompte-backend-1 python manage.py test apps.transactions -v 1
```

Résultat attendu : tous les tests passent.

- [ ] **Commit final si tout est vert**

```bash
git log --oneline -5
```

Résultat attendu : les 4 commits des tasks 1–4 apparaissent.
