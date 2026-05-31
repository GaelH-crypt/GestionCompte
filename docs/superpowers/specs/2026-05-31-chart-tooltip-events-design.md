# Chart tooltip — affichage des transactions du jour

**Date :** 2026-05-31  
**Scope :** Graphiques 30 jours (dashboard, projections, simulations)

## Objectif

Au survol d'un jour sur les graphiques 30j, le tooltip affiche les transactions nommées qui tombent ce jour-là (récurrentes + crédits), avec leur montant signé et coloré.

## Backend

### `build_engine_from_user` (engine.py)

Ajouter `'label'` à chaque daily_event :

```python
# Récurrentes
daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind, 'label': rt.name})

# Crédits
daily_events.append({'date': pay_date, 'amount': amount, 'kind': 'credits', 'label': credit.name})
```

### `project_daily` (engine.py)

Modifier le bucket `by_date` pour collecter les événements nommés en plus des totaux :

```python
by_date = {}
for e in self.daily_events:
    bucket = by_date.setdefault(
        e['date'],
        {'income': Decimal('0'), 'expenses': Decimal('0'), 'credits': Decimal('0'), 'events': []},
    )
    bucket[e['kind']] += e['amount']
    bucket['events'].append({'label': e['label'], 'amount': float(e['amount']), 'kind': e['kind']})
```

Inclure `events` dans chaque point du résultat :

```python
result.append({
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

**Note :** Les deltas d'override (simulations : income/expenses/extra_expenses distribués uniformément) n'ont pas de label et n'apparaissent pas dans `events`. Comportement attendu.

## Frontend

### `types/index.ts`

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

### Tooltip custom (partagé entre les deux charts)

Composant inline dans chaque fichier chart (pas de fichier séparé — trop simple pour justifier une abstraction) :

```
Jour : 05/06
Solde : 3 420 €
─────────────
Salaire        +2 500 €   ← text-green-400
Loyer            -850 €   ← text-red-400
EDF               -89 €   ← text-red-400
```

- Séparateur `<hr>` uniquement si `events.length > 0`
- `income` → vert (`text-green-400`), `expenses` + `credits` → rouge (`text-red-400`)
- Style dark existant conservé : `bg #111827`, border `#374151`, `borderRadius 8px`, `fontSize 12px`

### Fichiers à modifier

- `frontend/src/components/dashboard/EvolutionChart.tsx` — remplacer `<Tooltip>` par custom
- `frontend/src/components/projections/ProjectionChart.tsx` — idem

### Scope limité

Les graphiques mensuels (3/6/12/60 mois) utilisent `project()` et non `project_daily`. Ils ne reçoivent pas de `events` et ne sont pas modifiés.

## Tests

Les tests backend existants de `project_daily` passent les daily_events sans `label`. Ils doivent être mis à jour pour inclure `'label'` dans les fixtures et vérifier que le champ `events` est présent dans le résultat.
