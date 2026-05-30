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
