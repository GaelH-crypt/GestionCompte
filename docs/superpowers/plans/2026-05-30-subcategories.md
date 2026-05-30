# Subcategories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre la gestion complète des sous-catégories (voir/ajouter/supprimer) dans CategoriesPage, et afficher les sous-catégories dans les sélecteurs de catégorie via `<optgroup>`.

**Architecture:** Un helper `renderCategoryOptions` extrait dans `frontend/src/utils/categoryOptions.tsx` est utilisé par TransactionsPage, RecurringPage et ImportWizard. CategoriesPage est réécrite pour supporter l'expand/collapse par parent et l'ajout/suppression de sous-catégories. Aucun changement backend nécessaire.

**Tech Stack:** React 18, TypeScript, TanStack Query, Tailwind CSS, Lucide icons. API `/categories/` retourne déjà `subcategories[]` imbriquées.

---

## Fichiers

| Action | Fichier |
|--------|---------|
| Créer | `frontend/src/utils/categoryOptions.tsx` |
| Modifier | `frontend/src/pages/TransactionsPage.tsx` |
| Modifier | `frontend/src/pages/RecurringPage.tsx` |
| Modifier | `frontend/src/components/ImportWizard/StepPreview.tsx` |
| Modifier | `frontend/src/pages/CategoriesPage.tsx` |

---

## Task 1 — Helper `renderCategoryOptions`

**Fichiers :**
- Créer : `frontend/src/utils/categoryOptions.tsx`

- [ ] **Créer le fichier**

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

- [ ] **Vérifier la compilation**

```bash
docker compose build frontend 2>&1 | grep -E "error|Error|warn" | grep -v "node_modules" | head -10
```

Attendu : aucune erreur TypeScript.

- [ ] **Commit**

```bash
git add frontend/src/utils/categoryOptions.tsx
git commit -m "feat(categories): helper renderCategoryOptions avec optgroup"
```

---

## Task 2 — Sélecteurs catégorie (TransactionsPage, RecurringPage, ImportWizard)

**Fichiers :**
- Modifier : `frontend/src/pages/TransactionsPage.tsx`
- Modifier : `frontend/src/pages/RecurringPage.tsx`
- Modifier : `frontend/src/components/ImportWizard/StepPreview.tsx`

### 2a — TransactionsPage (`TransactionFormModal`)

- [ ] **Ajouter l'import dans `TransactionsPage.tsx`**

Ajouter après les imports existants :

```tsx
import { renderCategoryOptions } from '@/utils/categoryOptions'
```

- [ ] **Remplacer le select catégorie dans `TransactionFormModal`**

Localiser le bloc (autour de la ligne 438-448) :
```tsx
<option value="">Sans catégorie</option>
{(Array.isArray(categories) ? categories : []).map((c) => (
  <option key={c.id} value={c.id}>{c.name}</option>
))}
```

Remplacer par :
```tsx
<option value="">Sans catégorie</option>
{renderCategoryOptions(Array.isArray(categories) ? categories : [])}
```

### 2b — RecurringPage (`RecurringFormModal`)

- [ ] **Ajouter l'import dans `RecurringPage.tsx`**

```tsx
import { renderCategoryOptions } from '@/utils/categoryOptions'
```

- [ ] **Remplacer le select catégorie dans `RecurringFormModal`**

Localiser le bloc (autour de la ligne 332-335) :
```tsx
<option value="">Aucune</option>
{categories.map((c) => (
  <option key={c.id} value={c.id}>{c.name}</option>
))}
```

Remplacer par :
```tsx
<option value="">Aucune</option>
{renderCategoryOptions(categories)}
```

### 2c — StepPreview (ImportWizard)

- [ ] **Ajouter l'import dans `StepPreview.tsx`**

```tsx
import { renderCategoryOptions } from '@/utils/categoryOptions'
```

- [ ] **Remplacer le select catégorie dans `StepPreview.tsx`**

Localiser le bloc (autour de la ligne 57-60) :
```tsx
<option value="">Sans catégorie</option>
{categories.map((c) => (
  <option key={c.id} value={c.id}>{c.name}</option>
))}
```

Remplacer par :
```tsx
<option value="">Sans catégorie</option>
{renderCategoryOptions(categories)}
```

- [ ] **Vérifier la compilation**

```bash
docker compose build frontend 2>&1 | grep -E "^.*error TS" | grep -v "node_modules" | head -10
```

Attendu : aucune erreur.

- [ ] **Commit**

```bash
git add frontend/src/pages/TransactionsPage.tsx frontend/src/pages/RecurringPage.tsx frontend/src/components/ImportWizard/StepPreview.tsx
git commit -m "feat(categories): sélecteurs catégorie avec optgroup pour sous-catégories"
```

---

## Task 3 — CategoriesPage avec gestion des sous-catégories

**Fichiers :**
- Modifier : `frontend/src/pages/CategoriesPage.tsx`

- [ ] **Remplacer le contenu entier de `CategoriesPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Tag, ChevronDown, ChevronRight } from 'lucide-react'
import { categoriesApi } from '@/api/categories'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [formError, setFormError] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [subName, setSubName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.results),
  })

  const createMut = useMutation({
    mutationFn: (d: { name: string; color: string; icon: string; parent?: number }) =>
      categoriesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setShowForm(false)
      setName('')
      setColor('#6366f1')
      setFormError('')
      setAddingTo(null)
      setSubName('')
    },
    onError: () => setFormError('Erreur lors de la création.'),
  })

  const deleteMut = useMutation({
    mutationFn: categoriesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  if (isLoading) return <PageSpinner />

  const categories = data ?? []

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (addingTo === id) { setAddingTo(null); setSubName('') }
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-400">
          {categories.length} catégorie{categories.length > 1 ? 's' : ''}
        </p>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-4 w-4" /> Nouvelle catégorie
        </Button>
      </div>

      {showForm && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              createMut.mutate({ name: name.trim(), color, icon: 'Tag' })
            }}
            className="flex gap-3 items-end flex-wrap"
          >
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-gray-400">Nom</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="ex: Alimentation"
                className={inp}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-400">Couleur</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-16 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer p-1"
              />
            </div>
            <Button type="submit" loading={createMut.isPending}>Ajouter</Button>
            {formError && <p className="text-sm text-red-400 w-full">{formError}</p>}
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {categories.map((cat) => {
          const subs = cat.subcategories ?? []
          const isExpanded = expanded.has(cat.id)
          const isAdding = addingTo === cat.id

          return (
            <Card key={cat.id} padding={false}>
              {/* Parent row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm text-gray-200">{cat.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleExpanded(cat.id)}
                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title={isExpanded ? 'Replier' : `${subs.length} sous-catégorie${subs.length !== 1 ? 's' : ''}`}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                    }
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer la catégorie "${cat.name}" ?`)) {
                        deleteMut.mutate(cat.id)
                      }
                    }}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Subcategories panel */}
              {isExpanded && (
                <div className="border-t border-gray-800 px-4 py-2 space-y-0.5">
                  {subs.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0 opacity-60"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-sm text-gray-300">{sub.name}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer "${sub.name}" ?`)) {
                            deleteMut.mutate(sub.id)
                          }
                        }}
                        className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {isAdding ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (!subName.trim()) return
                        createMut.mutate({
                          name: subName.trim(),
                          color: cat.color,
                          icon: 'Tag',
                          parent: cat.id,
                        })
                      }}
                      className="flex gap-2 items-center pt-1.5"
                    >
                      <input
                        autoFocus
                        value={subName}
                        onChange={(e) => setSubName(e.target.value)}
                        placeholder="Nom de la sous-catégorie"
                        className={`${inp} flex-1`}
                        required
                      />
                      <Button size="sm" type="submit" loading={createMut.isPending}>
                        Ajouter
                      </Button>
                      <button
                        type="button"
                        onClick={() => { setAddingTo(null); setSubName('') }}
                        className="text-xs text-gray-500 hover:text-white px-2 py-1"
                      >
                        ✕
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => { setAddingTo(cat.id); setSubName('') }}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-400 py-1.5 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Sous-catégorie
                    </button>
                  )}
                </div>
              )}
            </Card>
          )
        })}

        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <Tag className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Aucune catégorie. Créez-en une.</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Vérifier la compilation**

```bash
docker compose build frontend 2>&1 | grep -E "^.*error TS" | grep -v "node_modules" | head -10
```

Attendu : aucune erreur.

- [ ] **Commit**

```bash
git add frontend/src/pages/CategoriesPage.tsx
git commit -m "feat(categories): gestion sous-catégories — expand/collapse, ajout, suppression"
```

---

## Task 4 — Build et déploiement

- [ ] **Build et déploiement final**

```bash
docker compose build frontend 2>&1 | tail -3
docker compose up frontend 2>&1 | tail -3
```

Attendu : `Frontend build copied to shared volume`, exit code 0.

- [ ] **Tests manuels dans le navigateur** (http://localhost:8085)

1. **CategoriesPage** :
   - Cliquer le chevron `›` sur une catégorie avec sous-catégories → panneau s'ouvre
   - Cliquer `+ Sous-catégorie` → champ inline apparaît
   - Saisir un nom + Ajouter → sous-catégorie apparaît dans la liste
   - Cliquer la corbeille sur une sous-catégorie → supprimée
   - Cliquer à nouveau le chevron → panneau se referme

2. **Formulaire transaction** :
   - Créer / éditer une transaction → select catégorie affiche des `<optgroup>` pour les catégories avec sous-catégories
   - Les catégories sans sous-catégories restent sélectionnables directement
   - Sélectionner une sous-catégorie → sauvegardé correctement

3. **ImportWizard** :
   - Importer un fichier → colonne catégorie affiche le même select avec optgroups

4. **RecurringPage** :
   - Créer / éditer une récurrente → select catégorie avec optgroups
