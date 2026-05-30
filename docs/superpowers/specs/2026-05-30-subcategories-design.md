# Gestion des sous-catégories — Design

**Date :** 2026-05-30  
**Statut :** Approuvé

## Contexte

Le modèle `Category` supporte déjà les sous-catégories via un champ `parent` FK sur lui-même. Le backend retourne les catégories racines avec leurs sous-catégories imbriquées (`GET /categories/`). La création/suppression d'une sous-catégorie se fait via les mêmes endpoints (`POST /categories/` avec `parent`, `DELETE /categories/<id>/`). Il n'y a aucun changement backend nécessaire.

**3 lacunes frontend à combler :**
1. CategoriesPage — on voit le compte "X sous-catégories" mais on ne peut ni les voir, ni en ajouter, ni en supprimer.
2. Formulaire transaction (TransactionsPage) — le `<select>` catégorie n'affiche que les racines.
3. ImportWizard StepPreview — même problème.

---

## 1. CategoriesPage

### Comportement

Chaque carte parent acquiert un chevron cliquable. Par défaut repliée.

**Dépliée :**
- Liste des sous-catégories (nom + point coloré hérité du parent + bouton supprimer)
- Bouton `+ Sous-catégorie` qui révèle un champ inline (nom uniquement)
- Soumission → `POST /categories/` avec `{ name, color: parent.color, icon: 'Tag', parent: parent.id }`
- Suppression → `DELETE /categories/<subId>/` + invalidation `['categories']`

**Suppression d'un parent :**
Comportement existant conservé (`SET_NULL` en base — les sous-catégories perdent leur parent mais ne sont pas supprimées). L'utilisateur reçoit le `confirm()` actuel.

### État local

```ts
const [expanded, setExpanded] = useState<Set<number>>(new Set())
const [addingTo, setAddingTo] = useState<number | null>(null)  // id du parent en cours d'ajout
const [subName, setSubName] = useState('')
```

### Fichier modifié
- `frontend/src/pages/CategoriesPage.tsx`

---

## 2. Sélecteur catégorie (formulaire transaction)

### Rendu optgroup

```tsx
function renderCategoryOptions(categories: Category[]) {
  return categories.map((c) =>
    c.subcategories && c.subcategories.length > 0 ? (
      <optgroup key={c.id} label={c.name}>
        {c.subcategories.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </optgroup>
    ) : (
      <option key={c.id} value={c.id}>{c.name}</option>
    )
  )
}
```

- Catégories **sans** sous-catégories → `<option>` sélectionnable directement.
- Catégories **avec** sous-catégories → `<optgroup>` (en-tête non sélectionnable) + sous-catégories en `<option>`.
- Option "Sans catégorie" en tête, inchangée.

### Fichiers modifiés
- `frontend/src/pages/TransactionsPage.tsx` — `TransactionFormModal` (ligne ~444)
- `frontend/src/components/ImportWizard/StepPreview.tsx` (ligne ~58)

---

## 3. Extraction d'un helper partagé

`renderCategoryOptions` est identique dans les deux fichiers. Pour éviter la duplication, la fonction est définie dans un fichier utilitaire :

- **Créer** : `frontend/src/utils/categoryOptions.tsx`

```tsx
import type { Category } from '@/types'

export function renderCategoryOptions(categories: Category[]) {
  return categories.map((c) =>
    c.subcategories && c.subcategories.length > 0 ? (
      <optgroup key={c.id} label={c.name}>
        {c.subcategories.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </optgroup>
    ) : (
      <option key={c.id} value={c.id}>{c.name}</option>
    )
  )
}
```

Les deux consommateurs importent cette fonction.

---

## Hors scope

- Sous-sous-catégories (profondeur > 2) — le modèle le permettrait mais l'UI ne le gère pas.
- Modifier le nom/couleur d'une sous-catégorie.
- Affichage de la sous-catégorie dans le tableau des transactions (colonne `category_name` affiche déjà le nom de la catégorie assignée, qu'elle soit racine ou sous-catégorie).
