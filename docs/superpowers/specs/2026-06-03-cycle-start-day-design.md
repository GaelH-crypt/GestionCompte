# Design : Jour de début de cycle budgétaire

**Date :** 2026-06-03
**Branche :** feature/checking-account-dashboard
**Statut :** approuvé

## Problème

Tous les calculs "ce mois" sont basés sur le 1er du mois calendaire. L'utilisateur est payé le 25, donc son "mois budgétaire" va du 25 au 24 du mois suivant. Il faut permettre de configurer ce jour de départ.

## Solution retenue

Ajouter `cycle_start_day` (entier 1–28, défaut 1) dans `UserPreference`. Une fonction utilitaire centrale calcule le début du cycle courant. Tous les endroits qui utilisent `today.replace(day=1)` passent par cette fonction.

La valeur 28 comme maximum évite les problèmes de fin de mois (février = 28 jours minimum).

## Modèle de données

```python
# apps/preferences/models.py
class UserPreference(models.Model):
    user = models.OneToOneField(User, ...)
    primary_account = models.ForeignKey(...)
    cycle_start_day = models.PositiveSmallIntegerField(default=1)
    # Validé : 1 ≤ cycle_start_day ≤ 28
```

Migration Django requise.

## Utilitaire central — `apps/preferences/cycle.py`

```python
from datetime import date
from calendar import monthrange
from dateutil.relativedelta import relativedelta

def get_cycle_start(today: date, cycle_start_day: int) -> date:
    """Début du cycle budgétaire courant.
    
    Exemples (cycle_start_day=25) :
      - today=2026-06-03 → 2026-05-25
      - today=2026-06-26 → 2026-06-25
      - cycle_start_day=1 → today.replace(day=1) (comportement actuel)
    """
    if today.day >= cycle_start_day:
        return today.replace(day=cycle_start_day)
    prev = today.replace(day=1) - relativedelta(months=1)
    return prev.replace(day=min(cycle_start_day, monthrange(prev.year, prev.month)[1]))
```

## API preferences

`GET /api/preferences/` — expose `cycle_start_day` dans la réponse.
`PATCH /api/preferences/` — accepte `cycle_start_day` avec validation `1 ≤ x ≤ 28`.

## Fichiers modifiés

### `apps/preferences/models.py`
Ajout du champ `cycle_start_day`.

### `apps/preferences/serializers.py` (nouveau ou existant)
Validation `1 ≤ cycle_start_day ≤ 28` via `MinValueValidator`/`MaxValueValidator`.

### `apps/preferences/cycle.py` (nouveau)
Fonction `get_cycle_start`.

### `apps/dashboard/views.py`

**`dashboard_summary`** :
```python
pref = UserPreference.objects.filter(user=user).first()
cycle_start_day = pref.cycle_start_day if pref else 1
first_of_month = get_cycle_start(today, cycle_start_day)
# Tout le reste inchangé
```

**`balance_history`** :
- Itère sur les 12 derniers cycles au lieu des 12 derniers mois calendaires
- Chaque cycle : `start = get_cycle_start_for_offset(today, cycle_start_day, i)`, `end = start + relativedelta(months=1) - timedelta(days=1)`
- Label : `"25 Avr → 24 Mai"` (format `"%-d %b → %-d %b"`)

Nouvelle fonction helper :
```python
def get_cycle_start_nth_ago(today: date, cycle_start_day: int, n: int) -> date:
    """Début du cycle il y a n cycles (0 = cycle courant)."""
    current = get_cycle_start(today, cycle_start_day)
    return current - relativedelta(months=n)
```

### `apps/projections/engine.py`

`build_engine_from_user` et `build_engine_for_account` reçoivent un paramètre optionnel `cycle_start_day: int = 1` et remplacent :
```python
first_of_month = today.replace(day=1)
```
par :
```python
first_of_month = get_cycle_start(today, cycle_start_day)
```

Les appelants (`projections/views.py`) lisent la préférence et passent la valeur.

### `apps/projections/views.py`

Lit `UserPreference.cycle_start_day` et le passe à `build_engine_from_user` et `build_engine_for_account`.

### `frontend/src/pages/SettingsPage.tsx`

Nouveau sélecteur dans la section "Préférences" :

```
Début de mois budgétaire
[selector 1–28]  (1 = calendaire, 25 = si payé le 25)
```

- Sauvegarde via `PATCH /api/preferences/` existant
- Invalide les queries `dashboard`, `projections`, `balance-history` après sauvegarde

### `frontend/src/api/preferences.ts`

Ajoute `cycle_start_day` au type de réponse et au body du PATCH.

## Ce qui ne change pas

- `_monthly_charge_dates` — jour de prélèvement d'un crédit, logique indépendante
- `ProjectionEngine.project()` / `project_daily()` — projection future, pas de bord de cycle passé
- Tous les tests existants — rétrocompat garantie par `default=1`

## Tests

### Unitaires `get_cycle_start`
- cycle_start_day=1 → équivalent à `today.replace(day=1)`
- today avant le jour (today=3, day=25) → mois précédent
- today après le jour (today=26, day=25) → mois courant
- Mois court (today=1 mars, day=31) → 28 ou 29 fév clamped

### `dashboard_summary` (cycle_start_day=25)
- Transaction du 25 mai incluse (dans le cycle), du 24 mai exclue
- Transaction du 3 juin incluse si today=3 juin

### `balance_history` (cycle_start_day=25)
- Label du cycle courant = `"25 Mai → 24 Juin"` (si today=juin)
- 12 cycles générés, bornes contiguës (pas de trou ni chevauchement)

### `build_engine_from_user` (cycle_start_day=25)
- Récurrent payé le 26 mai détecté comme "payé ce cycle" quand today=3 juin
- Récurrent payé le 24 mai non détecté comme "payé ce cycle"

### Serializer
- `cycle_start_day=0` → erreur de validation
- `cycle_start_day=29` → erreur de validation
- `cycle_start_day=28` → OK
