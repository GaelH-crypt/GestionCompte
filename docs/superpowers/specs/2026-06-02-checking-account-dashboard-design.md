# Design : Solde compte courant sur le dashboard et les projections

**Date :** 2026-06-02  
**Branche cible :** feature/checking-account-dashboard

---

## Contexte

Le dashboard affiche actuellement un solde global (somme de tous les comptes actifs). L'utilisateur souhaite distinguer son compte courant principal du reste (épargne, liquidités, etc.) via une tuile dédiée et des courbes supplémentaires sur les graphiques d'évolution et de projection.

---

## Objectifs

1. Permettre à l'utilisateur de désigner un compte comme "compte courant principal" dans un nouvel écran Paramètres.
2. Afficher une tuile "Solde compte courant" sur le dashboard (avec invite si non configuré).
3. Afficher deux lignes sur l'EvolutionChart du dashboard (solde global + solde compte courant projeté dynamiquement).
4. Afficher deux lignes sur le ProjectionChart pour tous les horizons (1 mois, 3 mois, 6 mois, 1 an, 5 ans) + KPI cards dupliqués.
5. Partout où le compte courant est attendu mais non configuré : bandeau discret avec lien vers /settings.

---

## Architecture

### Backend

#### Nouveau modèle `UserPreference` (`apps/preferences/`)

```python
class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference')
    primary_account = models.ForeignKey(
        'accounts.Account', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )
```

- Créé automatiquement à la première requête GET (get_or_create).
- Migration incluse dans la nouvelle app `apps/preferences/`.
- Enregistrée dans `INSTALLED_APPS` et `urls.py`.

#### Endpoint REST `GET/PATCH /api/preferences/`

- `GET` → `{ "primary_account": id | null, "primary_account_name": str | null }`
- `PATCH` → accepte `{ "primary_account": id | null }`, valide que le compte appartient à l'utilisateur et est actif. Retourne 400 si le compte n'appartient pas à l'utilisateur.

#### Enrichissement `GET /api/dashboard/summary/`

Deux champs supplémentaires dans la réponse :

```json
{
  "checking_account_id": 3,
  "checking_account_balance": 1250.50
}
```

Valeurs `null` si aucun compte courant configuré. Calculé via `get_account_balance(preference.primary_account)`.

#### Enrichissement `GET /api/projections/?months=N`

Chaque `ProjectionPoint` reçoit un champ `checking_balance: float | null` si un compte courant est configuré.

Le moteur exécute une deuxième passe identique à `build_engine_from_user` mais :
- `current_balance` = solde du seul compte courant
- `daily_events` filtrés par `account_id == preference.primary_account_id`
- `monthly_income`, `monthly_expenses`, `monthly_credits` recalculés avec le filtre account

Cette deuxième passe est encapsulée dans `build_engine_for_account(user, account_id, overrides)` dans `engine.py`.

---

### Frontend

#### Nouveau type dans `types/index.ts`

```typescript
export interface UserPreference {
  primary_account: number | null
  primary_account_name: string | null
}
```

Champs ajoutés à `DashboardSummary` :

```typescript
checking_account_id: number | null
checking_account_balance: number | null
```

Champ ajouté à `ProjectionPoint` :

```typescript
checking_balance?: number | null
```

#### Nouvelle API `api/preferences.ts`

```typescript
export const preferencesApi = {
  get: () => client.get<UserPreference>('/preferences/'),
  patch: (data: Partial<UserPreference>) => client.patch<UserPreference>('/preferences/', data),
}
```

#### Page Paramètres (`pages/SettingsPage.tsx`)

- Route `/settings` dans `App.tsx`.
- Entrée dans la navigation (sidebar/menu) avec icône `Settings` de Lucide.
- Contenu : section "Compte courant principal" avec un `<select>` listant les comptes actifs (hors type `credit`).
- Chargement via `GET /api/preferences/` + `GET /api/accounts/`.
- Sauvegarde via `PATCH /api/preferences/` ; invalidation des query keys `['dashboard-summary']`, `['projections', *]`, `['preferences']`.
- Message de succès après sauvegarde (toast ou bandeau inline).
- Option "Aucun" (null) pour désélectionner.

#### Dashboard (`DashboardPage.tsx`)

- 7e tuile `StatCard` "Solde compte courant" avec icône `Building2`.
  - Si `summary.checking_account_balance !== null` : affiche le montant.
  - Sinon : affiche un message "Non configuré" avec `<Link to="/settings">Configurer</Link>`.
- `EvolutionChart` reçoit les mêmes `data: ProjectionPoint[]` issus de `projectionsApi.project(1)` — chaque point contient déjà `checking_balance`. Le composant détecte lui-même la présence de données CC.

#### EvolutionChart (`components/dashboard/EvolutionChart.tsx`)

- Détecte `hasChecking` en interne : `data.some(d => d.checking_balance != null)`.
- Deuxième `<linearGradient id="checkingGrad">` en vert (`#10b981`).
- Deuxième `<Area dataKey="checking_balance" stroke="#10b981" ... />` conditionnel.
- Tooltip : affiche les deux valeurs libellées "Solde global" et "Solde compte courant".

#### ProjectionsPage (`pages/ProjectionsPage.tsx`)

- Bandeau d'invite si `data[0].checking_balance === null` et compte courant non configuré (lien vers `/settings`).
- 3 KPI cards supplémentaires conditionnels : "Solde de départ CC", "Solde prévu CC", "Évolution CC".
- `ProjectionChart` reçoit `showChecking: boolean`.

#### ProjectionChart (`components/projections/ProjectionChart.tsx`)

- Prop `showChecking?: boolean`.
- Troisième `<Area dataKey="checking_balance" stroke="#10b981" fill="url(#checkingGrad)" ... />` conditionnel.
- Tooltip enrichi avec la valeur "Solde CC" si présente.
- Légende : les deux courbes sont identifiées par leur couleur (brand purple = global, green = compte courant).

---

## Gestion de l'état vide

| Situation | Comportement |
|---|---|
| Aucun compte courant configuré (dashboard tuile) | StatCard avec texte "Non configuré" + lien /settings |
| Aucun compte courant configuré (graphiques) | 2e ligne absente, pas d'erreur |
| Aucun compte courant configuré (projections KPI) | Section CC masquée, bandeau invite |
| Compte courant supprimé/désactivé | `primary_account` passe à null via `SET_NULL`, même comportement |

---

## Flux de données

```
User sélectionne compte → PATCH /api/preferences/
                        → Invalidation cache React Query
                        → GET /api/dashboard/summary/ retourne checking_account_balance
                        → GET /api/projections/?months=N retourne checking_balance par point
```

---

## Fichiers à créer

- `backend/apps/preferences/__init__.py`
- `backend/apps/preferences/apps.py`
- `backend/apps/preferences/models.py`
- `backend/apps/preferences/serializers.py`
- `backend/apps/preferences/views.py`
- `backend/apps/preferences/urls.py`
- `backend/apps/preferences/migrations/0001_initial.py`
- `frontend/src/api/preferences.ts`
- `frontend/src/pages/SettingsPage.tsx`

## Fichiers à modifier

- `backend/config/settings/base.py` (INSTALLED_APPS)
- `backend/config/urls.py` (include preferences urls)
- `backend/apps/dashboard/views.py` (enrichissement checking_account_*)
- `backend/apps/projections/engine.py` (build_engine_for_account + checking_balance)
- `backend/apps/projections/views.py` (passing checking_balance to response)
- `frontend/src/types/index.ts` (UserPreference, DashboardSummary, ProjectionPoint)
- `frontend/src/App.tsx` (route /settings)
- `frontend/src/components/layout/AppLayout.tsx` (lien nav Paramètres)
- `frontend/src/pages/DashboardPage.tsx` (7e tuile + pass checking data)
- `frontend/src/components/dashboard/EvolutionChart.tsx` (2e Area)
- `frontend/src/pages/ProjectionsPage.tsx` (KPI CC + showChecking)
- `frontend/src/components/projections/ProjectionChart.tsx` (3e Area)

---

## Tests

- Backend : tests unitaires pour `UserPreference` CRUD, validation ownership, enrichissement dashboard, projection per-account.
- Frontend : pas de tests unitaires prévus (pas de setup Jest dans ce projet), validation manuelle.
