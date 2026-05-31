# Règles de catégorisation automatique — Design Spec

## Objectif

Permettre à l'utilisateur de créer des règles personnalisées qui associent un motif de texte (contient / commence par / exact) à une catégorie. Les règles sont appliquées automatiquement à l'import et peuvent être appliquées en masse à la demande sur les transactions sans catégorie.

---

## Modèle de données

### `CategoryRule`

```python
class CategoryRule(models.Model):
    MATCH_CHOICES = [
        ('contains',    'Contient'),
        ('starts_with', 'Commence par'),
        ('exact',       'Exact'),
    ]
    user       = ForeignKey(User, on_delete=CASCADE)
    pattern    = CharField(max_length=200)          # texte saisi par l'utilisateur
    match_type = CharField(max_length=20, choices=MATCH_CHOICES, default='contains')
    category   = ForeignKey(Category, on_delete=CASCADE)
    order      = PositiveIntegerField(default=0)    # ordre de priorité (croissant)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']
        unique_together = ('user', 'pattern', 'match_type')
```

---

## Backend

### Service `backend/apps/categories/rules.py`

Contient deux fonctions :

**`match_rule(description: str, pattern: str, match_type: str) -> bool`**
- `contains` : `pattern.upper() in description.upper()`
- `starts_with` : `description.upper().startswith(pattern.upper())`
- `exact` : `description.upper() == pattern.upper()`

**`apply_rules(user, queryset) -> int`**
- Charge les règles de l'utilisateur (ordonnées)
- Pour chaque transaction du queryset sans catégorie : teste chaque règle, affecte la première qui matche
- Retourne le nombre de transactions catégorisées
- Fallback : si aucune règle utilisateur ne matche, tente `suggest_category` (règles statiques)

### API — nouvelles routes sous `/categories/rules/`

| Méthode | URL | Action |
|---------|-----|--------|
| GET | `/categories/rules/` | Liste des règles de l'utilisateur |
| POST | `/categories/rules/` | Créer une règle |
| DELETE | `/categories/rules/{id}/` | Supprimer une règle |
| POST | `/categories/rules/apply/` | Appliquer les règles à toutes les transactions sans catégorie |

Serializer `CategoryRuleSerializer` : champs `id`, `pattern`, `match_type`, `category` (id + name en lecture), `order`.

### Intégration import (`imports/views.py`)

Après la création en masse des transactions dans `ConfirmView`, appeler :

```python
from apps.categories.rules import apply_rules
apply_rules(request.user, Transaction.objects.filter(id__in=created_ids, category=None))
```

Cela remplace le `suggest_category` inline (qui ne s'appliquait qu'à la prévisualisation, pas à la confirmation). Les règles statiques restent en fallback.

---

## Frontend

### Section "Règles de catégorisation" dans `CategoriesPage.tsx`

Ajoutée après la liste des catégories. Composant dédié `CategoryRules` (extrait dans `components/categories/CategoryRules.tsx` pour garder `CategoriesPage` lisible).

**Affichage :**
- Liste des règles existantes : `pattern` | type (badge) | → catégorie | bouton supprimer
- Formulaire inline "Ajouter une règle" : champ texte pattern + select type (`Contient / Commence par / Exact`) + select catégorie (avec optgroups sous-catégories) + bouton "+"
- Bouton "Appliquer les règles" → appelle `/categories/rules/apply/` → toast "X transaction(s) catégorisée(s)"

### Nouveaux types dans `types/index.ts`

```typescript
export interface CategoryRule {
  id: number
  pattern: string
  match_type: 'contains' | 'starts_with' | 'exact'
  category: { id: number; name: string }
  order: number
}
```

### Nouvelles fonctions dans `api/categories.ts`

```typescript
rules: {
  list: () => client.get<CategoryRule[]>('/categories/rules/'),
  create: (data: Omit<CategoryRule, 'id' | 'order'> & { category: number }) =>
    client.post<CategoryRule>('/categories/rules/', data),
  delete: (id: number) => client.delete(`/categories/rules/${id}/`),
  apply: () => client.post<{ applied: number }>('/categories/rules/apply/'),
}
```

---

## Migration

Une seule migration pour `CategoryRule`. Pas de changement sur les modèles existants.

---

## Tests

- `match_rule` : 3 cas (contains, starts_with, exact) × cas insensible à la casse
- `apply_rules` : règle matche → transaction catégorisée ; aucune règle → fallback statique ; déjà catégorisée → non modifiée
- Vue API : create, list, delete, apply (avec mock transactions)
