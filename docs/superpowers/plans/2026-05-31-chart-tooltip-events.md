# Chart Tooltip — Transactions du jour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au survol d'un jour sur les graphiques 30j, le tooltip affiche les transactions nommées (récurrentes + crédits) avec montant signé et coloré.

**Architecture:** Le backend enrichit les `daily_events` avec un champ `label`, `project_daily` les agrège par date et expose un champ `events` dans chaque point. Le frontend ajoute ce champ au type `ProjectionPoint` et remplace le tooltip recharts par un composant custom dans `EvolutionChart` et `ProjectionChart`.

**Tech Stack:** Python/Django (backend), TypeScript/React/recharts v2.12 (frontend), Docker Compose pour les tests.

---

## Files

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Modify | `backend/apps/projections/engine.py` | Ajouter `label` aux daily_events, propager `events` dans `project_daily` |
| Modify | `backend/apps/projections/tests.py` | Mettre à jour fixtures + ajouter test events |
| Modify | `frontend/src/types/index.ts` | Ajouter `events` à `ProjectionPoint` |
| Modify | `frontend/src/components/dashboard/EvolutionChart.tsx` | Custom tooltip |
| Modify | `frontend/src/components/projections/ProjectionChart.tsx` | Custom tooltip |

---

### Task 1 : Backend — enrichir daily_events et project_daily

**Files:**
- Modify: `backend/apps/projections/engine.py`

- [ ] **Step 1 : Ajouter `label` dans `build_engine_from_user` (récurrentes)**

Dans `build_engine_from_user`, la ligne qui appende les événements des récurrentes (dans la boucle `for rt in RecurringTransaction.objects.filter(...)`):

Remplacer :
```python
daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind})
```
Par :
```python
daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind, 'label': rt.name})
```

- [ ] **Step 2 : Ajouter `label` dans `build_engine_from_user` (crédits)**

Dans la boucle `for credit in Credit.objects.filter(...)`, la ligne qui appende les crédits :

Remplacer :
```python
daily_events.append({'date': pay_date, 'amount': amount, 'kind': 'credits'})
```
Par :
```python
daily_events.append({'date': pay_date, 'amount': amount, 'kind': 'credits', 'label': credit.name})
```

- [ ] **Step 3 : Modifier `project_daily` — collecter les events nommés par date**

Dans `project_daily`, remplacer le bloc `by_date` :

Remplacer :
```python
by_date = {}
for e in self.daily_events:
    bucket = by_date.setdefault(
        e['date'],
        {'income': Decimal('0'), 'expenses': Decimal('0'), 'credits': Decimal('0')},
    )
    bucket[e['kind']] += e['amount']
```
Par :
```python
by_date = {}
for e in self.daily_events:
    bucket = by_date.setdefault(
        e['date'],
        {'income': Decimal('0'), 'expenses': Decimal('0'), 'credits': Decimal('0'), 'events': []},
    )
    bucket[e['kind']] += e['amount']
    bucket['events'].append({
        'label': e.get('label', ''),
        'amount': float(e['amount']),
        'kind': e['kind'],
    })
```

- [ ] **Step 4 : Inclure `events` dans chaque point du résultat de `project_daily`**

Dans `project_daily`, remplacer le `result.append({...})` :

Remplacer :
```python
result.append({
    # Compact day label (e.g. "30/05"), reused as the chart X axis key.
    'month': day.strftime('%d/%m'),
    'date': day.isoformat(),
    'income': float(income),
    'expenses': float(expenses),
    'credits': float(credits),
    'net': float(net),
    'balance': float(balance),
})
```
Par :
```python
result.append({
    # Compact day label (e.g. "30/05"), reused as the chart X axis key.
    'month': day.strftime('%d/%m'),
    'date': day.isoformat(),
    'income': float(income),
    'expenses': float(expenses),
    'credits': float(credits),
    'net': float(net),
    'balance': float(balance),
    'events': b['events'] if b else [],
})
```

---

### Task 2 : Backend tests — mise à jour + nouveau test events

**Files:**
- Modify: `backend/apps/projections/tests.py`

- [ ] **Step 1 : Mettre à jour `test_daily_projection_places_events_on_real_dates` pour inclure `label`**

Remplacer le bloc `events = [...]` dans ce test :
```python
events = [
    {'date': today + timedelta(days=2), 'amount': Decimal('2000'), 'kind': 'income'},
    {'date': today + timedelta(days=4), 'amount': Decimal('800'), 'kind': 'expenses'},
    {'date': today + timedelta(days=4), 'amount': Decimal('400'), 'kind': 'credits'},
]
```
Par :
```python
events = [
    {'date': today + timedelta(days=2), 'amount': Decimal('2000'), 'kind': 'income', 'label': 'Salaire'},
    {'date': today + timedelta(days=4), 'amount': Decimal('800'), 'kind': 'expenses', 'label': 'Loyer'},
    {'date': today + timedelta(days=4), 'amount': Decimal('400'), 'kind': 'credits', 'label': 'Crédit auto'},
]
```

- [ ] **Step 2 : Ajouter un test qui vérifie le champ `events` dans le résultat**

Ajouter après `test_daily_projection_places_events_on_real_dates` :

```python
def test_daily_projection_events_field_contains_named_events(self):
    from apps.projections.engine import ProjectionEngine
    today = date.today()
    events = [
        {'date': today + timedelta(days=1), 'amount': Decimal('2500'), 'kind': 'income', 'label': 'Salaire'},
        {'date': today + timedelta(days=3), 'amount': Decimal('850'), 'kind': 'expenses', 'label': 'Loyer'},
        {'date': today + timedelta(days=3), 'amount': Decimal('200'), 'kind': 'credits', 'label': 'Crédit voiture'},
    ]
    engine = ProjectionEngine(
        current_balance=Decimal('1000'),
        monthly_income=Decimal('0'),
        monthly_expenses=Decimal('0'),
        monthly_credits=Decimal('0'),
        daily_events=events,
    )
    result = engine.project_daily(days=5)
    # Day 1 has one income event
    self.assertEqual(len(result[0]['events']), 1)
    self.assertEqual(result[0]['events'][0]['label'], 'Salaire')
    self.assertAlmostEqual(result[0]['events'][0]['amount'], 2500.0, places=1)
    self.assertEqual(result[0]['events'][0]['kind'], 'income')
    # Day 3 has two events
    self.assertEqual(len(result[2]['events']), 2)
    labels = {e['label'] for e in result[2]['events']}
    self.assertEqual(labels, {'Loyer', 'Crédit voiture'})
    # Days without events have empty list
    self.assertEqual(result[1]['events'], [])
    self.assertEqual(result[4]['events'], [])
```

- [ ] **Step 3 : Ajouter un test que les events sans label (override delta) ont `events: []`**

```python
def test_daily_projection_override_days_have_no_events(self):
    from apps.projections.engine import ProjectionEngine
    engine = ProjectionEngine(
        current_balance=Decimal('1000'),
        monthly_income=Decimal('0'),
        monthly_expenses=Decimal('0'),
        monthly_credits=Decimal('0'),
        daily_events=[],
        overrides={'income': Decimal('300')},
    )
    result = engine.project_daily(days=3)
    for point in result:
        self.assertEqual(point['events'], [])
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

```bash
docker compose exec backend python manage.py test apps.projections -v 2
```

Résultat attendu : toutes les assertions passent, 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add backend/apps/projections/engine.py backend/apps/projections/tests.py
git commit -m "feat(projections): expose named events per day in project_daily"
```

---

### Task 3 : Frontend — type ProjectionPoint

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1 : Ajouter le champ `events` à `ProjectionPoint`**

Dans `frontend/src/types/index.ts`, modifier l'interface `ProjectionPoint` :

Remplacer :
```ts
export interface ProjectionPoint {
  month: string
  date: string
  income: number
  expenses: number
  credits: number
  net: number
  balance: number
  baseline_balance?: number
  delta?: number
}
```
Par :
```ts
export interface ProjectionPoint {
  month: string
  date: string
  income: number
  expenses: number
  credits: number
  net: number
  balance: number
  baseline_balance?: number
  delta?: number
  events?: { label: string; amount: number; kind: string }[]
}
```

- [ ] **Step 2 : Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add events field to ProjectionPoint"
```

---

### Task 4 : Frontend — custom tooltip dans EvolutionChart

**Files:**
- Modify: `frontend/src/components/dashboard/EvolutionChart.tsx`

- [ ] **Step 1 : Ajouter l'import `TooltipProps` de recharts**

Remplacer le bloc d'imports recharts existant :
```ts
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
```
Par :
```ts
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
```

- [ ] **Step 2 : Ajouter le composant `ChartTooltip` avant `EvolutionChart`**

Ajouter après les imports et avant la définition de `formatEur` :

```tsx
const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload as ProjectionPoint
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>Jour : {label}</p>
      <p style={{ color: '#fff', fontWeight: 600 }}>{formatEur(point.balance)}</p>
      {point.events && point.events.length > 0 && (
        <>
          <hr style={{ borderColor: '#374151', margin: '6px 0' }} />
          {point.events.map((e, i) => (
            <p key={i} style={{ color: e.kind === 'income' ? '#4ade80' : '#f87171', margin: '2px 0' }}>
              {e.label} : {e.kind === 'income' ? '+' : '-'}{formatEur(e.amount)}
            </p>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3 : Remplacer le `<Tooltip>` recharts par le composant custom**

Dans le JSX de `EvolutionChart`, remplacer :
```tsx
<Tooltip
  contentStyle={{
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    fontSize: '12px',
  }}
  formatter={(v: number) => [formatEur(v), 'Solde']}
  labelFormatter={(label) => `Jour : ${label}`}
/>
```
Par :
```tsx
<Tooltip content={<ChartTooltip />} />
```

- [ ] **Step 4 : Vérifier que le build TypeScript passe**

```bash
docker compose exec frontend npx tsc --noEmit
```

Résultat attendu : 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/components/dashboard/EvolutionChart.tsx
git commit -m "feat(dashboard): custom tooltip with named events on 30d chart"
```

---

### Task 5 : Frontend — custom tooltip dans ProjectionChart

**Files:**
- Modify: `frontend/src/components/projections/ProjectionChart.tsx`

- [ ] **Step 1 : Ajouter les imports nécessaires**

Remplacer le bloc d'imports recharts existant :
```ts
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { ProjectionPoint } from '@/types'
```
Par :
```ts
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { ProjectionPoint } from '@/types'
```

- [ ] **Step 2 : Ajouter `tooltipStyle` et `ChartTooltip` après `formatEur` (déjà présent)**

`formatEur` existe déjà à la ligne 7 de ce fichier — ne pas le redéfinir. Ajouter juste après :

```tsx
const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload as ProjectionPoint
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>Jour : {label}</p>
      <p style={{ color: '#fff', fontWeight: 600 }}>{formatEur(point.balance)}</p>
      {point.events && point.events.length > 0 && (
        <>
          <hr style={{ borderColor: '#374151', margin: '6px 0' }} />
          {point.events.map((e, i) => (
            <p key={i} style={{ color: e.kind === 'income' ? '#4ade80' : '#f87171', margin: '2px 0' }}>
              {e.label} : {e.kind === 'income' ? '+' : '-'}{formatEur(e.amount)}
            </p>
          ))}
        </>
      )}
    </div>
  )
}
```

**Note :** `ProjectionChart.tsx` a déjà `formatEur` à la ligne 7 — `tooltipStyle` et `ChartTooltip` viennent juste après.

- [ ] **Step 3 : Remplacer le `<Tooltip>` recharts par le composant custom**

Dans le JSX de `ProjectionChart`, remplacer :
```tsx
<Tooltip
  contentStyle={{
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    fontSize: '12px',
  }}
  formatter={(v: number) => [formatEur(v), '']}
/>
```
Par :
```tsx
<Tooltip content={<ChartTooltip />} />
```

- [ ] **Step 4 : Vérifier que le build TypeScript passe**

```bash
docker compose exec frontend npx tsc --noEmit
```

Résultat attendu : 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add frontend/src/components/projections/ProjectionChart.tsx
git commit -m "feat(projections): custom tooltip with named events on 30d chart"
```

---

### Task 6 : Vérification finale

- [ ] **Step 1 : Relancer tous les tests backend**

```bash
docker compose exec backend python manage.py test apps.projections -v 2
```

Résultat attendu : tous les tests passent.

- [ ] **Step 2 : Vérifier le build frontend**

```bash
docker compose exec frontend npx tsc --noEmit
```

Résultat attendu : 0 erreur TypeScript.

- [ ] **Step 3 : Vérification manuelle dans le navigateur**

Ouvrir le dashboard → graphique "Évolution sur les 30 prochains jours" → survoler un jour avec une transaction récurrente. Le tooltip doit afficher :
```
Jour : 05/06
3 420 €
──────────
Loyer : -850 €        ← rouge
```
Survoler un jour sans transaction : tooltip simple (date + solde, pas de séparateur).

Vérifier aussi sur la page Projections (horizon 1 mois) et Simulations (horizon 1 mois).
