# Vue « Jour le jour » par période — Design

**Date :** 2026-06-05
**Statut :** Validé (brainstorming)

## Objectif

Aujourd'hui, la projection « jour le jour » (`project_daily`) n'existe que pour
l'horizon **1 mois / 30 jours** : elle est codée en dur via `months == 1` dans
`apps/projections/views.py`. On veut pouvoir **basculer n'importe quel horizon
court en vue jour-le-jour** grâce à un bouton, sur **chaque page comportant un
graphique de projection** (Projections, Simulations, Dashboard).

## Décisions de cadrage

| Question | Décision |
| --- | --- |
| Pages concernées | Projections, Simulations **et** Dashboard |
| Horizons autorisés en jour-le-jour | **1, 3 et 6 mois** uniquement |
| Horizons longs (1 an, 5 ans) | Option « Jour le jour » **désactivée** |
| Dashboard | Recevoir le **même sélecteur d'horizon** (1/3/6/12/60) + le toggle |
| Special-case `months===1` | Remplacé par un flag `daily` explicite |

## Comportement UX

Un **toggle segmenté « Mensuel | Jour le jour »** s'ajoute à côté du sélecteur
d'horizon sur les trois pages.

- Le mode jour-le-jour n'est disponible que pour les horizons **1, 3 et 6 mois**.
- Pour **1 an** et **5 ans**, l'option « Jour le jour » est **grisée**.
- Si l'utilisateur passe à un horizon long alors que le mode jour-le-jour est
  actif, on **rebascule automatiquement en Mensuel** et l'option est désactivée.
- État initial : `daily = (months === 1)`.
  - Projections / Simulations (défaut **12 mois**) démarrent en **Mensuel** ; le
    graphe 30 jours actuel reste identique quand l'utilisateur choisit « 1 mois ».
  - Le **Dashboard** démarre sur **1 mois / Jour le jour** (= comportement actuel).

Règle d'activation du toggle : `dailyAllowed = months <= 6`. Le bouton « Jour le
jour » est désactivé sinon, et sélectionner un horizon > 6 mois force `daily = false`.

## Backend — `apps/projections`

### `views.py`

- Remplacer le déclencheur `months == 1` par un paramètre explicite :
  - `projection_view` : query param `daily` (`?daily=true`).
  - `simulation_view` : champ booléen `daily` dans le corps de la requête.
- Règle commune :
  - `daily and months in {1, 3, 6}` → `engine.project_daily(days)` où
    `days = (today + relativedelta(months=months) - today).days`.
  - Sinon → `engine.project(months)`.
- Si `daily` est demandé pour un horizon **12 ou 60**, le backend l'ignore et
  renvoie le mensuel (défense en profondeur ; le front ne le demandera pas).
- La logique compte courant (`checking_engine`) et baseline (simulation) est
  **inchangée** : elle est simplement branchée sur le même choix
  `project_daily` / `project` que le résultat principal.
- `VALID_HORIZONS` reste `{1, 3, 6, 12, 60}`.

### `engine.py`

- Étendre `daily_end` de `today + 62 jours` à
  `today + relativedelta(months=6) + timedelta(days=5)` (~190 j) dans
  **`build_engine_from_user`** et **`build_engine_for_account`**, afin que les
  occurrences récurrentes et les échéances de crédit couvrent le plus long
  horizon jour-le-jour (6 mois).
- Les événements *yearly* sont **déjà inclus** dans les daily events via
  `_build_daily_recurring_events` (`_FREQ_STEP` contient `yearly`) — aucun
  changement nécessaire de ce côté.
- Aucune autre logique de calcul ne change. Le surcoût (générer les events sur
  6 mois au lieu de 2 même pour une projection mensuelle) est négligeable.

## Frontend

### `api/projections.ts`

- `project(months, daily?)` ajoute `?daily=true` quand `daily` est vrai.
- `simulate` accepte `daily` dans le payload `SimulationParams`.

### `types/index.ts`

- `SimulationParams` reçoit `daily?: boolean`.

### Nouveau composant `components/projections/ViewModeToggle.tsx`

- Segmented control réutilisable « Mensuel / Jour le jour ».
- Props : `value: 'monthly' | 'daily'`, `onChange`, `dailyAllowed: boolean`.
- Quand `dailyAllowed` est faux, l'option « Jour le jour » est grisée et non
  cliquable. Style aligné sur les boutons d'horizon existants.

### `ProjectionsPage.tsx` / `SimulationsPage.tsx`

- Ajout d'un état `daily` (booléen), initialisé à `months === 1`.
- Insertion du `ViewModeToggle` à côté du sélecteur d'horizon.
- `daily` ajouté à la `queryKey` (Projections) / au payload de mutation
  (Simulations).
- `isDaily` dérive désormais de l'état `daily` au lieu de `months === 1`.
- À la sélection d'un horizon > 6 mois : `setDaily(false)`.

### `DashboardPage.tsx`

- Ajout d'un sélecteur d'horizon (1/3/6/12/60) + `ViewModeToggle`.
- États `months` (défaut 1) et `daily` (défaut true).
- La query `projections-daily-dashboard` passe `project(months, daily)` et
  inclut `months`/`daily` dans sa `queryKey`.

### `components/dashboard/EvolutionChart.tsx`

- Le titre figé « Évolution sur les 30 prochains jours » devient **dynamique**
  selon l'horizon et le mode (mensuel vs jour-le-jour), via une prop de titre ou
  un calcul interne basé sur les données. Le tooltip « Jour : … » reste correct
  en jour-le-jour ; en mensuel il affiche le libellé de mois.

## Tests

- **Backend** (`apps/projections/tests.py`) :
  - `daily=true` sur **3 mois** et **6 mois** : le nombre de points renvoyés égale
    le nombre de jours de l'horizon, et les occurrences récurrentes / échéances de
    crédit au-delà de 62 jours apparaissent bien.
  - `daily=true` avec **12 / 60 mois** : ignoré, réponse mensuelle (nb points = nb mois).
  - `simulation_view` avec `daily=true` : baseline et delta cohérents en jour-le-jour
    sur 3 mois.
- Pas de runner Docker dans cet environnement : validation via tests Django directs.

## Hors périmètre (YAGNI)

- Pas de jour-le-jour pour 1 an / 5 ans (volume de points trop élevé).
- Pas de modification de la page Analyse (pas de graphe de projection).
- Pas d'échantillonnage / agrégation côté graphe : les ~180 points max restent
  gérés par les ticks Recharts existants (`interval`, `minTickGap`).
