# Transactions / Recurring / Credits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the transaction edit crash, add a "save as recurring" toggle to the transaction form, show interest breakdown on credit cards, and allow linking a recurring transaction to a loan.

**Architecture:** Backend adds one FK field (`credit`) to `RecurringTransaction` with a migration and serializer update. All other changes are pure frontend — defensive guards on the transaction modal, a new recurring toggle with create-on-save logic, interest/capital breakdown computed client-side, and linked-recurring section loaded from the existing recurring list.

**Tech Stack:** Django/DRF (backend), React 18 + React Query v5 + TypeScript (frontend), Vite build, Tailwind CSS.

---

## File Map

| File | Change |
|------|--------|
| `backend/apps/recurring/models.py` | Add `credit` FK field |
| `backend/apps/recurring/migrations/0002_recurringtransaction_credit.py` | New migration |
| `backend/apps/recurring/serializers.py` | Add `credit` + `credit_name` fields |
| `backend/apps/recurring/tests.py` | Add tests for credit FK |
| `frontend/src/types/index.ts` | Add `credit`, `credit_name` to `RecurringTransaction` |
| `frontend/src/pages/TransactionsPage.tsx` | Fix crash + add recurring toggle |
| `frontend/src/pages/RecurringPage.tsx` | Add credit selector + "Prêt" column |
| `frontend/src/pages/CreditsPage.tsx` | Interest breakdown + linked recurring section |

---

## Task 1 — Backend: credit FK on RecurringTransaction

**Files:**
- Modify: `backend/apps/recurring/models.py`
- Create: `backend/apps/recurring/migrations/0002_recurringtransaction_credit.py`
- Modify: `backend/apps/recurring/serializers.py`
- Modify: `backend/apps/recurring/tests.py`

- [ ] **Step 1.1 — Write failing tests**

Open `backend/apps/recurring/tests.py` and append:

```python
from apps.credits.models import Credit
import datetime


class RecurringCreditLinkTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('credituser', password='testpass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=1000, color='#fff', icon='CreditCard'
        )
        self.credit = Credit.objects.create(
            user=self.user, name='Prêt immo', credit_type='mortgage',
            initial_capital='200000', remaining_capital='180000',
            interest_rate='1.5', monthly_payment='850', insurance_monthly='50',
            duration_months=240, start_date=datetime.date(2022, 1, 1),
            early_repayment_possible=True
        )

    def test_create_recurring_with_credit_returns_credit_name(self):
        resp = self.client.post('/api/recurring/', {
            'name': 'Mensualité prêt', 'amount': '900.00',
            'transaction_type': 'expense', 'frequency': 'monthly',
            'next_occurrence': '2026-06-01', 'account': self.account.id,
            'credit': self.credit.id,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['credit'], self.credit.id)
        self.assertEqual(resp.data['credit_name'], 'Prêt immo')

    def test_create_recurring_without_credit_returns_null(self):
        resp = self.client.post('/api/recurring/', {
            'name': 'Loyer', 'amount': '800.00',
            'transaction_type': 'expense', 'frequency': 'monthly',
            'next_occurrence': '2026-06-01', 'account': self.account.id,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data['credit'])
        self.assertIsNone(resp.data['credit_name'])
```

- [ ] **Step 1.2 — Run tests to confirm they fail**

```bash
cd backend
python manage.py test apps.recurring.tests.RecurringCreditLinkTest -v 2
```

Expected: `FAIL` — `credit` field does not exist on the model yet.

- [ ] **Step 1.3 — Add credit FK to model**

In `backend/apps/recurring/models.py`, add the import and field:

```python
from django.db import models
from django.contrib.auth.models import User
from apps.accounts.models import Account
from apps.categories.models import Category


class RecurringTransaction(models.Model):
    FREQUENCIES = [
        ('weekly', 'Hebdomadaire'),
        ('monthly', 'Mensuelle'),
        ('yearly', 'Annuelle'),
    ]
    TRANSACTION_TYPES = [
        ('income', 'Revenu'),
        ('expense', 'Dépense'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recurring_transactions')
    name = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES, default='expense')
    frequency = models.CharField(max_length=20, choices=FREQUENCIES, default='monthly')
    next_occurrence = models.DateField()
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    credit = models.ForeignKey(
        'credits.Credit',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recurring_transactions',
    )
    is_active = models.BooleanField(default=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['next_occurrence']

    def __str__(self):
        return self.name
```

- [ ] **Step 1.4 — Create migration**

Create `backend/apps/recurring/migrations/0002_recurringtransaction_credit.py`:

```python
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('recurring', '0001_initial'),
        ('credits', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='recurringtransaction',
            name='credit',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='recurring_transactions',
                to='credits.credit',
            ),
        ),
    ]
```

- [ ] **Step 1.5 — Update serializer**

Replace the entire `backend/apps/recurring/serializers.py`:

```python
from rest_framework import serializers
from .models import RecurringTransaction


class RecurringTransactionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    credit_name = serializers.CharField(source='credit.name', read_only=True, allow_null=True)

    class Meta:
        model = RecurringTransaction
        fields = (
            'id', 'name', 'amount', 'transaction_type', 'frequency', 'next_occurrence',
            'category', 'category_name', 'account', 'account_name',
            'credit', 'credit_name',
            'is_active', 'note', 'created_at',
        )
        read_only_fields = ('id', 'created_at', 'category_name', 'account_name', 'credit_name')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
```

- [ ] **Step 1.6 — Run tests to confirm they pass**

```bash
cd backend
python manage.py test apps.recurring.tests.RecurringCreditLinkTest -v 2
```

Expected: `OK` — 2 tests pass.

- [ ] **Step 1.7 — Commit**

```bash
git add backend/apps/recurring/models.py \
        backend/apps/recurring/migrations/0002_recurringtransaction_credit.py \
        backend/apps/recurring/serializers.py \
        backend/apps/recurring/tests.py
git commit -m "feat(recurring): add optional credit FK to RecurringTransaction"
```

---

## Task 2 — Frontend: update RecurringTransaction type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 2.1 — Add credit fields to RecurringTransaction interface**

In `frontend/src/types/index.ts`, find the `RecurringTransaction` interface (around line 65) and add two fields:

```typescript
export interface RecurringTransaction {
  id: number
  name: string
  amount: string
  transaction_type: 'income' | 'expense'
  frequency: Frequency
  next_occurrence: string
  category: number | null
  category_name: string | null
  account: number
  account_name: string
  credit: number | null
  credit_name: string | null
  is_active: boolean
  note: string
  created_at: string
}
```

- [ ] **Step 2.2 — Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add credit and credit_name to RecurringTransaction"
```

---

## Task 3 — Frontend: fix transaction edit crash

**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`

The crash is `TypeError: (j ?? []).map is not a function` — the `?? []` guard does not protect against truthy non-array values. Fix every `.map()` on query data with `Array.isArray`. Also fix `categoriesData?.results ?? []` (arrays have no `.results` property, so categories never reach ImportWizard).

- [ ] **Step 3.1 — Fix Array.isArray guards in TransactionFormModal**

In `TransactionsPage.tsx`, find the accounts select inside `TransactionFormModal`:

```tsx
{(accounts ?? []).map((a) => (
  <option key={a.id} value={a.id}>{a.name}</option>
))}
```

Replace with:

```tsx
{(Array.isArray(accounts) ? accounts : []).map((a) => (
  <option key={a.id} value={a.id}>{a.name}</option>
))}
```

Find the categories select inside `TransactionFormModal`:

```tsx
{(categories ?? []).map((c) => (
  <option key={c.id} value={c.id}>{c.name}</option>
))}
```

Replace with:

```tsx
{(Array.isArray(categories) ? categories : []).map((c) => (
  <option key={c.id} value={c.id}>{c.name}</option>
))}
```

- [ ] **Step 3.2 — Fix categories prop passed to ImportWizard**

In `TransactionsPage.tsx`, find the `<ImportWizard>` usage near the bottom of the main component:

```tsx
<ImportWizard
  open={showImport}
  onOpenChange={setShowImport}
  categories={categoriesData?.results ?? []}
/>
```

Replace with:

```tsx
<ImportWizard
  open={showImport}
  onOpenChange={setShowImport}
  categories={categoriesData ?? []}
/>
```

- [ ] **Step 3.3 — Manual test**

1. Start the app, navigate to Transactions
2. Click the pencil icon on any transaction
3. Verify the modal opens and is pre-filled (description, amount, date, account, category all populated)
4. Change a field and click Enregistrer — verify the transaction updates
5. Open browser console — verify no errors

- [ ] **Step 3.4 — Commit**

```bash
git add frontend/src/pages/TransactionsPage.tsx
git commit -m "fix(transactions): guard Array.isArray in modal and fix categories passed to ImportWizard"
```

---

## Task 4 — Frontend: add "save as recurring" toggle to TransactionFormModal

**Files:**
- Modify: `frontend/src/pages/TransactionsPage.tsx`

- [ ] **Step 4.1 — Add imports**

At the top of `TransactionsPage.tsx`, add:

```tsx
import { recurringApi } from '@/api/recurring'
import type { Transaction, TransactionType, Frequency } from '@/types'
```

(`Frequency` is new — it was only imported in `RecurringPage` before.)

- [ ] **Step 4.2 — Add recurring state to TransactionFormModal**

Inside `TransactionFormModal`, after the existing `useState` calls, add:

```tsx
const [isRecurring, setIsRecurring] = useState(transaction?.is_recurring ?? false)
const [recurringFrequency, setRecurringFrequency] = useState<Frequency>('monthly')
const [recurringNextOccurrence, setRecurringNextOccurrence] = useState(
  transaction?.date ?? new Date().toISOString().slice(0, 10)
)
```

- [ ] **Step 4.3 — Update handleSubmit**

Replace the existing `handleSubmit` in `TransactionFormModal`:

```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (type === 'transfer') {
    // transfers cannot be recurring — guard just in case
  }
  setLoading(true)
  setError('')
  try {
    const payload = {
      transaction_type: type,
      amount: String(amount),
      description,
      date,
      account: Number(accountId),
      category: categoryId ? Number(categoryId) : null,
      is_recurring: isRecurring && type !== 'transfer',
    }
    if (transaction) await transactionsApi.update(transaction.id, payload)
    else await transactionsApi.create(payload)

    if (isRecurring && type !== 'transfer') {
      try {
        await recurringApi.create({
          name: description,
          amount: String(amount),
          transaction_type: type as 'income' | 'expense',
          frequency: recurringFrequency,
          next_occurrence: recurringNextOccurrence,
          account: Number(accountId),
          category: categoryId ? Number(categoryId) : null,
        })
      } catch {
        // recurring creation failed but transaction was saved — show warning
        setError('Transaction enregistrée, mais la création de la récurrente a échoué.')
        setLoading(false)
        return
      }
    }

    onSaved()
  } catch {
    setError('Une erreur est survenue. Vérifiez les données.')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 4.4 — Add toggle JSX to the form**

Inside the `<form>` in `TransactionFormModal`, after the categories `<div>` and before `{error && ...}`, add:

```tsx
{type !== 'transfer' && (
  <div className="border-t border-gray-800 pt-4 space-y-3">
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={isRecurring}
        onChange={(e) => setIsRecurring(e.target.checked)}
        className="accent-brand-500"
      />
      <span className="text-sm text-gray-300">Enregistrer comme récurrente</span>
    </label>

    {isRecurring && (
      <div className="grid grid-cols-2 gap-3 pl-6">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-400">Fréquence</label>
          <select
            value={recurringFrequency}
            onChange={(e) => setRecurringFrequency(e.target.value as Frequency)}
            className={sel}
          >
            <option value="monthly">Mensuel</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="yearly">Annuel</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-400">Prochaine échéance</label>
          <input
            type="date"
            value={recurringNextOccurrence}
            onChange={(e) => setRecurringNextOccurrence(e.target.value)}
            className={sel}
          />
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4.5 — Update onSaved to invalidate recurring queries**

In `TransactionsPage`, find the `onSaved` prop passed to `TransactionFormModal`:

```tsx
onSaved={() => {
  setShowForm(false)
  qc.invalidateQueries({ queryKey: ['transactions'] })
  qc.invalidateQueries({ queryKey: ['accounts'] })
  qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
}}
```

Replace with:

```tsx
onSaved={() => {
  setShowForm(false)
  qc.invalidateQueries({ queryKey: ['transactions'] })
  qc.invalidateQueries({ queryKey: ['accounts'] })
  qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
  qc.invalidateQueries({ queryKey: ['recurring'] })
}}
```

- [ ] **Step 4.6 — Manual test**

1. Click "Nouvelle transaction" — fill in description "Loyer", type Dépense, amount 800, any account
2. Check "Enregistrer comme récurrente" — verify fréquence + date fields appear
3. Set fréquence to Mensuel, prochaine échéance to next month
4. Save — verify transaction appears in Transactions list
5. Navigate to Récurrent — verify "Loyer" appears with correct amount and frequency
6. Edit an existing transaction — verify "Enregistrer comme récurrente" is pre-checked if `is_recurring = true`

- [ ] **Step 4.7 — Commit**

```bash
git add frontend/src/pages/TransactionsPage.tsx
git commit -m "feat(transactions): add save-as-recurring toggle to transaction form"
```

---

## Task 5 — Frontend: credit selector in RecurringFormModal + "Prêt" column

**Files:**
- Modify: `frontend/src/pages/RecurringPage.tsx`

- [ ] **Step 5.1 — Add credits import**

At the top of `RecurringPage.tsx`, add:

```tsx
import { creditsApi } from '@/api/credits'
```

- [ ] **Step 5.2 — Add credits query to RecurringPage**

Inside the `RecurringPage` component, after the existing queries, add:

```tsx
const { data: creditsData } = useQuery({
  queryKey: ['credits'],
  queryFn: () => creditsApi.list().then((r) => r.data.results),
})
const credits = creditsData ?? []
```

- [ ] **Step 5.3 — Add "Prêt" column to the table header**

Find the table headers array:

```tsx
{['Nom', 'Montant', 'Type', 'Fréquence', 'Prochaine échéance', 'Compte', 'Statut', ''].map(
```

Replace with:

```tsx
{['Nom', 'Montant', 'Type', 'Fréquence', 'Prochaine échéance', 'Compte', 'Prêt', 'Statut', ''].map(
```

- [ ] **Step 5.4 — Add "Prêt" cell to each table row**

Find the table row inside `items.map((r) => ...)`. After the `account_name` cell:

```tsx
<td className="px-6 py-3 text-sm text-gray-400">{r.account_name}</td>
```

Add:

```tsx
<td className="px-6 py-3 text-sm text-gray-400">{r.credit_name ?? '—'}</td>
```

Update `colSpan` in the empty state row from `8` to `9`:

```tsx
<td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
```

- [ ] **Step 5.5 — Pass credits to RecurringFormModal**

Find the `<RecurringFormModal>` usage in `RecurringPage` and update:

```tsx
{showForm && (
  <RecurringFormModal
    item={editing}
    credits={credits}
    onClose={() => setShowForm(false)}
    onSaved={() => {
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['recurring'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard-history'] })
      qc.invalidateQueries({ queryKey: ['projections'] })
    }}
  />
)}
```

- [ ] **Step 5.6 — Update RecurringFormModal interface and state**

Find the `RecurringFormModalProps` interface:

```tsx
interface RecurringFormModalProps {
  item: RecurringTransaction | null
  onClose: () => void
  onSaved: () => void
}
```

Replace with:

```tsx
interface RecurringFormModalProps {
  item: RecurringTransaction | null
  credits: import('@/types').Credit[]
  onClose: () => void
  onSaved: () => void
}
```

In the `RecurringFormModal` function signature, add `credits`:

```tsx
function RecurringFormModal({ item, credits, onClose, onSaved }: RecurringFormModalProps) {
```

Add credit state after the existing `useState` calls:

```tsx
const [creditId, setCreditId] = useState<string>(item?.credit ? String(item.credit) : '')
```

- [ ] **Step 5.7 — Add credit select to RecurringFormModal JSX**

In the form, after the note textarea and before the "Actif" checkbox, add:

```tsx
<div className="flex flex-col gap-1">
  <label className="text-sm font-medium text-gray-400">Lié à un prêt (optionnel)</label>
  <select value={creditId} onChange={(e) => setCreditId(e.target.value)} className={sel}>
    <option value="">Aucun</option>
    {credits.filter((c) => c.is_active).map((c) => (
      <option key={c.id} value={c.id}>{c.name}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 5.8 — Include credit in submit payload**

In `RecurringFormModal.handleSubmit`, update the payload:

```tsx
const payload: Partial<RecurringTransaction> = {
  name,
  amount,
  transaction_type: type,
  frequency,
  next_occurrence: nextOccurrence,
  account: parseInt(accountId),
  category: categoryId ? parseInt(categoryId) : null,
  credit: creditId ? parseInt(creditId) : null,
  note,
  is_active: isActive,
}
```

- [ ] **Step 5.9 — Manual test**

1. Navigate to Récurrent → click Ajouter
2. Verify "Lié à un prêt" dropdown appears with active credits
3. Select a credit, save — verify the "Prêt" column shows the credit name in the table
4. Edit that recurring entry — verify the credit is pre-selected
5. Set credit to "Aucun", save — verify "Prêt" column shows "—"

- [ ] **Step 5.10 — Commit**

```bash
git add frontend/src/pages/RecurringPage.tsx
git commit -m "feat(recurring): add credit selector and Prêt column"
```

---

## Task 6 — Frontend: interest breakdown + linked recurring in CreditsPage

**Files:**
- Modify: `frontend/src/pages/CreditsPage.tsx`

- [ ] **Step 6.1 — Add recurringApi import**

At the top of `CreditsPage.tsx`, add:

```tsx
import { recurringApi } from '@/api/recurring'
```

- [ ] **Step 6.2 — Add recurring query to CreditsPage**

Inside `CreditsPage`, after the credits query, add:

```tsx
const { data: recurringData } = useQuery({
  queryKey: ['recurring'],
  queryFn: () => recurringApi.list().then((r) => r.data.results),
})
const allRecurring = recurringData ?? []
```

- [ ] **Step 6.3 — Add interest breakdown helper**

At the top of `CreditsPage.tsx`, after the `formatEur` function, add:

```tsx
function computeMonthlyBreakdown(credit: import('@/types').Credit) {
  const monthlyRate = parseFloat(credit.interest_rate) / 1200
  const interest = parseFloat(credit.remaining_capital) * monthlyRate
  const capital = parseFloat(credit.monthly_payment) - interest
  const insurance = parseFloat(credit.insurance_monthly)
  return {
    interest: Math.max(0, interest),
    capital: Math.max(0, capital),
    insurance,
  }
}
```

- [ ] **Step 6.4 — Replace "Mensualité totale" row in credit cards**

Inside `credits.map((credit) => ...)`, find:

```tsx
<div className="flex justify-between text-sm">
  <span className="text-gray-400">Mensualité totale</span>
  <span className="text-orange-400 font-semibold">{formatEur(credit.total_monthly_charge)}</span>
</div>
```

Replace with:

```tsx
{(() => {
  const bd = computeMonthlyBreakdown(credit)
  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">Mensualité totale</span>
        <span className="text-orange-400 font-semibold">{formatEur(credit.total_monthly_charge)}</span>
      </div>
      <div className="flex justify-between text-xs pl-3">
        <span className="text-gray-500">dont capital</span>
        <span className="text-gray-400">{formatEur(bd.capital)}</span>
      </div>
      <div className="flex justify-between text-xs pl-3">
        <span className="text-gray-500">dont intérêts</span>
        <span className="text-gray-400">{formatEur(bd.interest)}</span>
      </div>
      {bd.insurance > 0 && (
        <div className="flex justify-between text-xs pl-3">
          <span className="text-gray-500">dont assurance</span>
          <span className="text-gray-400">{formatEur(bd.insurance)}</span>
        </div>
      )}
    </>
  )
})()}
```

- [ ] **Step 6.5 — Add linked recurring section to each credit card**

At the end of each credit card (after the progress bar section, before the closing `</Card>`), add:

```tsx
{(() => {
  const linked = allRecurring.filter((r) => r.credit === credit.id)
  if (linked.length === 0) return null
  return (
    <div className="mt-4 pt-3 border-t border-gray-800">
      <p className="text-xs font-medium text-gray-500 mb-2">Récurrentes liées</p>
      <div className="space-y-1">
        {linked.map((r) => (
          <div key={r.id} className="flex justify-between text-xs">
            <span className="text-gray-400">{r.name}</span>
            <span className="text-red-400">-{formatEur(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
})()}
```

- [ ] **Step 6.6 — Manual test**

1. Navigate to Prêts
2. For a credit with interest_rate > 0 and insurance_monthly > 0: verify "dont capital", "dont intérêts", "dont assurance" appear below "Mensualité totale" with correct values
3. Link a recurring transaction to a credit (via Récurrent page)
4. Navigate back to Prêts — verify the linked recurring appears at the bottom of the credit card

- [ ] **Step 6.7 — Commit**

```bash
git add frontend/src/pages/CreditsPage.tsx
git commit -m "feat(credits): add interest breakdown and linked recurring section to credit cards"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Fix edit button crash — Task 3 (Array.isArray guards + categoriesData fix)
- ✅ Save as recurring from transaction form — Task 4 (toggle + recurringApi.create)
- ✅ Interest detail on credit cards — Task 6 step 6.4
- ✅ Credit FK on RecurringTransaction — Task 1 (backend) + Task 2 (types)
- ✅ Credit selector in recurring form — Task 5
- ✅ "Prêt" column in recurring list — Task 5 steps 5.3–5.4
- ✅ Linked recurring in credit card — Task 6 step 6.5

**Type consistency:**
- `RecurringTransaction.credit: number | null` — defined in Task 2, used in Task 5 (payload) and Task 6 (filter)
- `RecurringTransaction.credit_name: string | null` — defined in Task 2, used in Task 5 (table cell `r.credit_name`)
- `Credit` type imported with `import('@/types').Credit` in Task 6 helper — consistent with existing import in `CreditsPage`
- `Frequency` imported in Task 4 — used for `recurringFrequency` state
- `recurringApi.create` payload `transaction_type: type as 'income' | 'expense'` — valid since the toggle is hidden for `transfer`

**No placeholders:** All steps contain actual code.
