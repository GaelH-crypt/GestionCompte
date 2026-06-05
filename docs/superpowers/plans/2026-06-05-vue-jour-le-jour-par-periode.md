# Vue « Jour le jour » par période — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de basculer n'importe quel horizon court (1, 3, 6 mois) en projection « jour le jour » via un bouton, sur les pages Projections, Simulations et Dashboard.

**Architecture:** Le backend possède déjà `ProjectionEngine.project_daily(days)`, aujourd'hui déclenché uniquement par `months == 1`. On remplace ce special-case par un flag explicite `daily` dans les vues, on étend la fenêtre de génération des événements quotidiens à 6 mois, et côté frontend on ajoute un toggle « Mensuel / Jour le jour » + (pour le Dashboard) un sélecteur d'horizon.

**Tech Stack:** Django 6 / DRF (backend), React 18 + TypeScript + Vite + React Query + Recharts + Tailwind (frontend).

**Conventions de test / validation :**
- Backend : `python manage.py test apps.projections` depuis `backend/` (nécessite `SECRET_KEY` + une base accessible, comme dans l'environnement de test/CI — pas de Docker en local, cf. mémoire projet).
- Frontend : `npx tsc --noEmit` et `npm run lint` depuis `frontend/` (pas de framework de test unitaire dans ce projet).

---

## Task 1: Backend — étendre la fenêtre des événements quotidiens à 6 mois

Aujourd'hui `daily_end = today + timedelta(days=62)` couvre seulement ~2 mois.
Pour une projection jour-le-jour jusqu'à 6 mois, il faut générer les occurrences
récurrentes et échéances de crédit sur 6 mois + marge.

**Files:**
- Modify: `backend/apps/projections/engine.py` (deux occurrences : `build_engine_from_user` et `build_engine_for_account`)
- Test: `backend/apps/projections/tests.py` (ajout dans la classe `BuildEngineFromUserTest`)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter cette méthode dans la classe `BuildEngineFromUserTest` (après `test_explicit_link_takes_priority_over_heuristic`) :

```python
    def test_daily_events_span_six_months(self):
        """Les récurrents mensuels doivent produire des occurrences au-delà de
        62 jours pour alimenter la projection jour-le-jour jusqu'à 6 mois."""
        from apps.recurring.models import RecurringTransaction
        from apps.projections.engine import build_engine_from_user
        today = date.today()
        RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Abonnement',
            amount=Decimal('10.00'), transaction_type='expense',
            frequency='monthly', next_occurrence=today + timedelta(days=10),
        )
        engine = build_engine_from_user(self.user)
        abo = [e for e in engine.daily_events if e['amount'] == Decimal('10.00')]
        self.assertTrue(
            any(e['date'] > today + timedelta(days=120) for e in abo),
            "Les récurrents mensuels doivent produire des occurrences au-delà de 4 mois",
        )
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `python manage.py test apps.projections.tests.BuildEngineFromUserTest.test_daily_events_span_six_months`
Expected: FAIL — aucune occurrence au-delà de 120 jours (fenêtre limitée à 62 j).

- [ ] **Step 3: Étendre `daily_end` dans les deux fonctions**

Dans `build_engine_from_user` (~ligne 244), remplacer :

```python
    daily_end = today + timedelta(days=62)
```

par :

```python
    # Couvre le plus long horizon jour-le-jour (6 mois) avec une petite marge.
    daily_end = today + relativedelta(months=6) + timedelta(days=5)
```

Dans `build_engine_for_account` (~ligne 339), remplacer le second :

```python
    daily_end = today + timedelta(days=62)
```

par le même :

```python
    # Couvre le plus long horizon jour-le-jour (6 mois) avec une petite marge.
    daily_end = today + relativedelta(months=6) + timedelta(days=5)
```

(`relativedelta` et `timedelta` sont déjà importés en tête de `engine.py`.)

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `python manage.py test apps.projections.tests.BuildEngineFromUserTest.test_daily_events_span_six_months`
Expected: PASS

- [ ] **Step 5: Lancer toute la suite projections (non-régression)**

Run: `python manage.py test apps.projections`
Expected: PASS (tous les tests existants restent verts)

- [ ] **Step 6: Commit**

```bash
git add backend/apps/projections/engine.py backend/apps/projections/tests.py
git commit -m "feat(projections): étend la fenêtre des événements quotidiens à 6 mois"
```

---

## Task 2: Backend — flag `daily` explicite dans `projection_view`

Remplacer le special-case `months == 1` par un paramètre `daily` qui fonctionne
pour les horizons 1, 3 et 6 mois, et factoriser le choix daily/monthly.

**Files:**
- Modify: `backend/apps/projections/views.py`
- Test: `backend/apps/projections/tests.py` (nouvelle classe)

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter cette classe à la fin de `backend/apps/projections/tests.py` :

```python
class ProjectionDailyHorizonTest(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from apps.accounts.models import Account
        self.user = User.objects.create_user('dailyuser', password='p')
        Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=1000,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_daily_true_returns_one_point_per_day(self):
        resp = self.client.get('/api/projections/?months=3&daily=true')
        self.assertEqual(resp.status_code, 200)
        today = date.today()
        expected_days = (today + relativedelta(months=3) - today).days
        self.assertEqual(len(resp.data), expected_days)
        self.assertIn('events', resp.data[0])

    def test_daily_ignored_for_long_horizon(self):
        resp = self.client.get('/api/projections/?months=12&daily=true')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)

    def test_monthly_by_default(self):
        resp = self.client.get('/api/projections/?months=3')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 3)
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `python manage.py test apps.projections.tests.ProjectionDailyHorizonTest`
Expected: FAIL — `test_daily_true_returns_one_point_per_day` renvoie 3 points (mensuel) car `daily` n'est pas géré.

- [ ] **Step 3: Refactoriser `projection_view`**

Dans `backend/apps/projections/views.py`, après la ligne `VALID_HORIZONS = {1, 3, 6, 12, 60}`, ajouter :

```python
# Horizons pour lesquels la vue jour-le-jour est autorisée.
DAILY_HORIZONS = {1, 3, 6}


def _parse_bool(value) -> bool:
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _run_projection(engine, months: int, daily: bool) -> list:
    """Lance la projection mensuelle ou jour-le-jour selon `daily`."""
    if daily:
        today = date.today()
        days = (today + relativedelta(months=months) - today).days
        return engine.project_daily(days)
    return engine.project(months)
```

Puis remplacer tout le bloc allant de `if months == 1:` jusqu'au `return Response(result)` final de `projection_view` par :

```python
    daily = _parse_bool(request.query_params.get('daily')) and months in DAILY_HORIZONS

    result = _run_projection(engine, months, daily)
    if checking_engine:
        checking_result = _run_projection(checking_engine, months, daily)
        result[0]['checking_start_balance'] = float(checking_engine.current_balance)
        for row, crow in zip(result, checking_result):
            row['checking_balance'] = crow['balance']
    else:
        for row in result:
            row['checking_balance'] = None
    return Response(result)
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `python manage.py test apps.projections.tests.ProjectionDailyHorizonTest`
Expected: PASS

- [ ] **Step 5: Lancer toute la suite projections (non-régression)**

Run: `python manage.py test apps.projections`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/projections/views.py backend/apps/projections/tests.py
git commit -m "feat(projections): flag daily explicite sur projection_view (1/3/6 mois)"
```

---

## Task 3: Backend — flag `daily` dans `simulation_view`

**Files:**
- Modify: `backend/apps/projections/views.py` (fonction `simulation_view`)
- Test: `backend/apps/projections/tests.py` (ajout dans `ProjectionDailyHorizonTest`)

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter cette méthode dans la classe `ProjectionDailyHorizonTest` :

```python
    def test_simulation_daily_true_returns_daily_points(self):
        resp = self.client.post(
            '/api/projections/simulate/', {'months': 3, 'daily': True}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        today = date.today()
        expected_days = (today + relativedelta(months=3) - today).days
        self.assertEqual(len(resp.data), expected_days)
        self.assertIn('baseline_balance', resp.data[0])
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `python manage.py test apps.projections.tests.ProjectionDailyHorizonTest.test_simulation_daily_true_returns_daily_points`
Expected: FAIL — renvoie 3 points mensuels.

- [ ] **Step 3: Brancher `daily` dans `simulation_view`**

Dans `simulation_view`, remplacer le bloc :

```python
    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        result = engine.project_daily(days)
        baseline = baseline_engine.project_daily(days)
    else:
        result = engine.project(months)
        baseline = baseline_engine.project(months)
```

par :

```python
    daily = _parse_bool(request.data.get('daily')) and months in DAILY_HORIZONS
    result = _run_projection(engine, months, daily)
    baseline = _run_projection(baseline_engine, months, daily)
```

(`_parse_bool` et `_run_projection` ont été ajoutés en Task 2 ; `_parse_bool(True)` renvoie bien `True`.)

- [ ] **Step 4: Lancer le test pour vérifier le succès**

Run: `python manage.py test apps.projections.tests.ProjectionDailyHorizonTest.test_simulation_daily_true_returns_daily_points`
Expected: PASS

- [ ] **Step 5: Lancer toute la suite projections (non-régression)**

Run: `python manage.py test apps.projections`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/projections/views.py backend/apps/projections/tests.py
git commit -m "feat(projections): flag daily sur simulation_view"
```

---

## Task 4: Frontend — API + types

**Files:**
- Modify: `frontend/src/api/projections.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Ajouter le paramètre `daily` à l'API**

Remplacer tout le contenu de `frontend/src/api/projections.ts` par :

```ts
import client from './client'
import type { ProjectionPoint, SimulationParams } from '@/types'

export const projectionsApi = {
  project: (months: number, daily = false) =>
    client.get<ProjectionPoint[]>('/projections/', { params: { months, daily } }),
  simulate: (params: SimulationParams) =>
    client.post<ProjectionPoint[]>('/projections/simulate/', params),
}
```

- [ ] **Step 2: Ajouter `daily` à `SimulationParams`**

Dans `frontend/src/types/index.ts`, repérer l'interface `SimulationParams` (vers la ligne 225) et ajouter le champ `daily` :

```ts
export interface SimulationParams {
  months: number
  income?: number
  expenses?: number
  credits?: number
  extra_expenses?: { label: string; amount: number }[]
  daily?: boolean
}
```

(Conserver les champs existants tels quels ; n'ajouter que `daily?: boolean`.)

- [ ] **Step 3: Vérifier la compilation TypeScript**

Run (depuis `frontend/`): `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/projections.ts frontend/src/types/index.ts
git commit -m "feat(frontend): paramètre daily sur l'API projections"
```

---

## Task 5: Frontend — composant `ViewModeToggle`

Segmented control réutilisable « Mensuel / Jour le jour ».

**Files:**
- Create: `frontend/src/components/projections/ViewModeToggle.tsx`

- [ ] **Step 1: Créer le composant**

Créer `frontend/src/components/projections/ViewModeToggle.tsx` :

```tsx
export type ViewMode = 'monthly' | 'daily'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  dailyAllowed: boolean
}

export function ViewModeToggle({ value, onChange, dailyAllowed }: ViewModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-gray-800 p-0.5">
      <button
        onClick={() => onChange('monthly')}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          value === 'monthly' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        Mensuel
      </button>
      <button
        onClick={() => dailyAllowed && onChange('daily')}
        disabled={!dailyAllowed}
        title={dailyAllowed ? undefined : 'Disponible jusqu’à 6 mois'}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          value === 'daily' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
        } ${!dailyAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        Jour le jour
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run (depuis `frontend/`): `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/projections/ViewModeToggle.tsx
git commit -m "feat(frontend): composant ViewModeToggle mensuel/jour-le-jour"
```

---

## Task 6: Frontend — toggle sur la page Projections

**Files:**
- Modify: `frontend/src/pages/ProjectionsPage.tsx`

- [ ] **Step 1: Ajouter l'import du toggle**

Après la ligne `import { ProjectionChart } from '@/components/projections/ProjectionChart'` ajouter :

```tsx
import { ViewModeToggle } from '@/components/projections/ViewModeToggle'
```

- [ ] **Step 2: Ajouter l'état `daily` et brancher la query**

Remplacer :

```tsx
  const [months, setMonths] = useState(12)

  const { data, isLoading } = useQuery({
    queryKey: ['projections', months],
    queryFn: () => projectionsApi.project(months).then((r) => r.data),
  })
```

par :

```tsx
  const [months, setMonths] = useState(12)
  const [daily, setDaily] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['projections', months, daily],
    queryFn: () => projectionsApi.project(months, daily).then((r) => r.data),
  })

  function selectHorizon(value: number) {
    setMonths(value)
    if (value > 6) setDaily(false)
  }
```

- [ ] **Step 3: Dériver `isDaily` de l'état**

Remplacer :

```tsx
  const isDaily = months === 1
```

par :

```tsx
  const isDaily = daily
```

- [ ] **Step 4: Insérer le toggle et brancher le sélecteur d'horizon**

Remplacer le bloc du sélecteur d'horizon :

```tsx
      {/* Horizon selector */}
      <div className="flex gap-2 flex-wrap">
        {HORIZONS.map((h) => (
          <button
            key={h.value}
            onClick={() => setMonths(h.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              months === h.value
                ? 'bg-brand-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>
```

par :

```tsx
      {/* Horizon selector + view mode */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {HORIZONS.map((h) => (
            <button
              key={h.value}
              onClick={() => selectHorizon(h.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                months === h.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
        <ViewModeToggle
          value={daily ? 'daily' : 'monthly'}
          onChange={(m) => setDaily(m === 'daily')}
          dailyAllowed={months <= 6}
        />
      </div>
```

- [ ] **Step 5: Vérifier compilation + lint**

Run (depuis `frontend/`): `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProjectionsPage.tsx
git commit -m "feat(projections): toggle jour-le-jour sur la page Projections"
```

---

## Task 7: Frontend — toggle sur la page Simulations

**Files:**
- Modify: `frontend/src/pages/SimulationsPage.tsx`

- [ ] **Step 1: Ajouter l'import du toggle**

Après `import { ProjectionChart } from '@/components/projections/ProjectionChart'` ajouter :

```tsx
import { ViewModeToggle } from '@/components/projections/ViewModeToggle'
```

- [ ] **Step 2: Ajouter l'état `daily`**

Remplacer :

```tsx
  const [months, setMonths] = useState(12)
```

par :

```tsx
  const [months, setMonths] = useState(12)
  const [daily, setDaily] = useState(false)

  function selectHorizon(value: number) {
    setMonths(value)
    if (value > 6) setDaily(false)
  }
```

- [ ] **Step 3: Transmettre `daily` à la simulation**

Dans `handleSimulate`, remplacer :

```tsx
    mutate({
      months,
      income: income ? parseFloat(income) : undefined,
      expenses: expenses ? parseFloat(expenses) : undefined,
      credits: credits ? parseFloat(credits) : undefined,
      extra_expenses: extraExpenses.length > 0
        ? extraExpenses.map(({ label, amount }) => ({ label, amount }))
        : undefined,
    })
```

par :

```tsx
    mutate({
      months,
      daily,
      income: income ? parseFloat(income) : undefined,
      expenses: expenses ? parseFloat(expenses) : undefined,
      credits: credits ? parseFloat(credits) : undefined,
      extra_expenses: extraExpenses.length > 0
        ? extraExpenses.map(({ label, amount }) => ({ label, amount }))
        : undefined,
    })
```

- [ ] **Step 4: Insérer le toggle et brancher le sélecteur d'horizon**

Remplacer le bloc Horizon :

```tsx
            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Horizon</label>
              <div className="flex flex-wrap gap-2">
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setMonths(h)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      months === h
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {HORIZON_LABELS[h]}
                  </button>
                ))}
              </div>
            </div>
```

par :

```tsx
            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Horizon</label>
              <div className="flex flex-wrap gap-2">
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => selectHorizon(h)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      months === h
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {HORIZON_LABELS[h]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Vue</label>
              <ViewModeToggle
                value={daily ? 'daily' : 'monthly'}
                onChange={(m) => setDaily(m === 'daily')}
                dailyAllowed={months <= 6}
              />
            </div>
```

- [ ] **Step 5: Vérifier compilation + lint**

Run (depuis `frontend/`): `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SimulationsPage.tsx
git commit -m "feat(simulations): toggle jour-le-jour sur la page Simulations"
```

---

## Task 8: Frontend — titre dynamique + densité des ticks dans `EvolutionChart`

Le Dashboard (Task 9) va réutiliser l'horizon ; le graphe doit afficher un titre
adapté et espacer ses ticks selon le nombre de points.

**Files:**
- Modify: `frontend/src/components/dashboard/EvolutionChart.tsx`

- [ ] **Step 1: Rendre le titre, le mode et l'intervalle des ticks paramétrables**

Remplacer la signature et le corps du composant `EvolutionChart` (à partir de `interface EvolutionChartProps`) par :

```tsx
interface EvolutionChartProps {
  data: ProjectionPoint[]
  title?: string
}
```

Puis, dans la fonction `ChartTooltip`, remplacer la ligne :

```tsx
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>Jour : {label}</p>
```

par :

```tsx
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>{label}</p>
```

Puis remplacer la déclaration du composant :

```tsx
export function EvolutionChart({ data }: EvolutionChartProps) {
  const minBalance = Math.min(...data.map((d) => d.balance))
  const isNegative = minBalance < 0
  const hasChecking = data.some((d) => d.checking_balance != null)

  return (
    <Card>
      <CardTitle>Évolution sur les 30 prochains jours</CardTitle>
```

par :

```tsx
export function EvolutionChart({ data, title = 'Évolution sur les 30 prochains jours' }: EvolutionChartProps) {
  const minBalance = Math.min(...data.map((d) => d.balance))
  const isNegative = minBalance < 0
  const hasChecking = data.some((d) => d.checking_balance != null)
  // Vise ~8 graduations quelle que soit la granularité (mensuelle ou quotidienne).
  const tickInterval = Math.floor(data.length / 8)

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
```

Enfin remplacer la ligne du `XAxis` :

```tsx
          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} interval={4} />
```

par :

```tsx
          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} interval={tickInterval} />
```

> Note : le tooltip affiche désormais `{label}` seul, ce qui convient aux deux
> granularités (« 30/05 » en jour-le-jour, « Jun 2026 » en mensuel). Le titre est
> calculé par l'appelant et transmis via `title`.

- [ ] **Step 2: Vérifier compilation + lint**

Run (depuis `frontend/`): `npx tsc --noEmit && npm run lint`
Expected: aucune erreur (la prop `title` a une valeur par défaut, l'appel actuel sans `title` reste valide).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/EvolutionChart.tsx
git commit -m "feat(dashboard): titre dynamique et ticks adaptatifs dans EvolutionChart"
```

---

## Task 9: Frontend — sélecteur d'horizon + toggle sur le Dashboard

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Ajouter les imports**

Après `import { useQuery } from '@tanstack/react-query'` ajouter :

```tsx
import { useState } from 'react'
```

Après `import { EvolutionChart } from '@/components/dashboard/EvolutionChart'` ajouter :

```tsx
import { ViewModeToggle } from '@/components/projections/ViewModeToggle'
```

- [ ] **Step 2: Définir les horizons et l'état**

Juste après la ligne `const formatEur = ...` (avant `export default function DashboardPage`), ajouter :

```tsx
const HORIZONS = [
  { label: '1 mois', value: 1 },
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '1 an', value: 12 },
  { label: '5 ans', value: 60 },
]
```

Dans le composant, remplacer :

```tsx
  const { data: history } = useQuery({
    queryKey: ['projections-daily-dashboard'],
    queryFn: () => projectionsApi.project(1).then((r) => r.data),
  })
```

par :

```tsx
  const [months, setMonths] = useState(1)
  const [daily, setDaily] = useState(true)

  function selectHorizon(value: number) {
    setMonths(value)
    if (value > 6) setDaily(false)
  }

  const { data: history } = useQuery({
    // Préfixe conservé pour que l'invalidation de SettingsPage continue de matcher.
    queryKey: ['projections-daily-dashboard', months, daily],
    queryFn: () => projectionsApi.project(months, daily).then((r) => r.data),
  })

  const horizonLabel =
    HORIZONS.find((h) => h.value === months)?.label ?? `${months} mois`
  const chartTitle = daily
    ? `Évolution jour le jour (${horizonLabel})`
    : `Évolution mensuelle (${horizonLabel})`
```

- [ ] **Step 3: Afficher le sélecteur d'horizon + toggle et brancher le graphe**

Remplacer le bloc des graphes :

```tsx
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {history && <EvolutionChart data={history} />}
        </div>
        <ExpensesChart data={summary.expenses_by_category} />
      </div>
```

par :

```tsx
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {HORIZONS.map((h) => (
                <button
                  key={h.value}
                  onClick={() => selectHorizon(h.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    months === h.value
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <ViewModeToggle
              value={daily ? 'daily' : 'monthly'}
              onChange={(m) => setDaily(m === 'daily')}
              dailyAllowed={months <= 6}
            />
          </div>
          {history && <EvolutionChart data={history} title={chartTitle} />}
        </div>
        <ExpensesChart data={summary.expenses_by_category} />
      </div>
```

- [ ] **Step 4: Vérifier compilation + lint**

Run (depuis `frontend/`): `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): sélecteur d'horizon + toggle jour-le-jour"
```

---

## Task 10: Validation finale

- [ ] **Step 1: Suite backend complète projections**

Run (depuis `backend/`): `python manage.py test apps.projections`
Expected: PASS

- [ ] **Step 2: Build frontend complet**

Run (depuis `frontend/`): `npm run build`
Expected: build réussi (tsc + vite), aucune erreur.

- [ ] **Step 3: Vérification manuelle (si serveur disponible)**

Lancer l'app (cf. README) et vérifier sur Projections, Simulations et Dashboard :
- Le toggle « Jour le jour » est grisé pour 1 an et 5 ans.
- Passer 3 mois en « Jour le jour » affiche bien une courbe quotidienne (un point par jour) sur tout l'horizon.
- Le graphe Dashboard met à jour son titre selon l'horizon et le mode.

---

## Notes d'implémentation

- **Ordre des tâches** : 1 → 3 (backend, testable isolément), puis 4 → 9 (frontend), puis 10 (validation). Les tâches frontend 6, 7, 9 dépendent de 4 et 5 ; la tâche 9 dépend de 8.
- **Pas de migration** : aucun changement de modèle.
- **Compat invalidation** : la `queryKey` du Dashboard conserve le préfixe `'projections-daily-dashboard'` pour que `SettingsPage` (`invalidateQueries({ queryKey: ['projections-daily-dashboard'] })`) continue de fonctionner par correspondance de préfixe.
