import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Zap } from 'lucide-react'
import { categoriesApi } from '@/api/categories'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { Category, CategoryRule } from '@/types'
import { renderCategoryOptions } from '@/utils/categoryOptions'

const MATCH_LABELS: Record<CategoryRule['match_type'], string> = {
  contains:    'Contient',
  starts_with: 'Commence par',
  exact:       'Exact',
}

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

interface Props {
  categories: Category[]
}

export function CategoryRules({ categories }: Props) {
  const qc = useQueryClient()
  const [pattern, setPattern] = useState('')
  const [matchType, setMatchType] = useState<CategoryRule['match_type']>('contains')
  const [categoryId, setCategoryId] = useState('')
  const [applyMsg, setApplyMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: rules = [] } = useQuery({
    queryKey: ['category-rules'],
    queryFn: () => categoriesApi.rules.list().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => categoriesApi.rules.create({
      pattern: pattern.trim(),
      match_type: matchType,
      category: Number(categoryId),
      order: rules.length,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-rules'] })
      setPattern('')
      setCategoryId('')
      setError(null)
    },
    onError: () => setError('Erreur lors de la création de la règle.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => categoriesApi.rules.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['category-rules'] })
      setError(null)
    },
    onError: () => setError('Erreur lors de la suppression.'),
  })

  const applyMut = useMutation({
    mutationFn: () => categoriesApi.rules.apply(),
    onSuccess: (res) => {
      const n = res.data.applied
      setApplyMsg(`${n} transaction${n !== 1 ? 's' : ''} catégorisée${n !== 1 ? 's' : ''}`)
      setTimeout(() => setApplyMsg(null), 4000)
      setError(null)
    },
    onError: () => setError('Erreur lors de l\'application des règles.'),
  })

  const canAdd = pattern.trim().length > 0 && categoryId !== ''

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <CardTitle>Règles de catégorisation</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => applyMut.mutate()}
          loading={applyMut.isPending}
        >
          <Zap className="h-3.5 w-3.5" />
          Appliquer les règles
        </Button>
      </div>

      {applyMsg && (
        <p className="text-sm text-green-400 mb-3">{applyMsg}</p>
      )}

      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}

      {rules.length > 0 && (
        <ul className="space-y-1.5 mb-4">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">
                  {MATCH_LABELS[rule.match_type]}
                </span>
                <span className="text-gray-200 font-mono truncate">{rule.pattern}</span>
                <span className="text-gray-500 flex-shrink-0">→</span>
                <span className="text-brand-400 truncate">{rule.category_name}</span>
              </div>
              <button
                onClick={() => deleteMut.mutate(rule.id)}
                className="text-gray-600 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {rules.length === 0 && (
        <p className="text-sm text-gray-500 mb-4">Aucune règle. Créez-en une ci-dessous.</p>
      )}

      {/* Add form */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as CategoryRule['match_type'])}
            className={`${inp} w-36 flex-shrink-0`}
          >
            <option value="contains">Contient</option>
            <option value="starts_with">Commence par</option>
            <option value="exact">Exact</option>
          </select>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Mot-clé (ex : Carburant)"
            className={`${inp} flex-1`}
            onKeyDown={(e) => e.key === 'Enter' && canAdd && createMut.mutate()}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`${inp} flex-1`}
          >
            <option value="">— Catégorie cible —</option>
            {renderCategoryOptions(categories)}
          </select>
          <button
            onClick={() => canAdd && createMut.mutate()}
            disabled={!canAdd || createMut.isPending}
            className="flex items-center gap-1 px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  )
}
