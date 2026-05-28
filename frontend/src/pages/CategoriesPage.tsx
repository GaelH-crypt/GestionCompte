import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Tag } from 'lucide-react'
import { categoriesApi } from '@/api/categories'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [formError, setFormError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.results),
  })

  const createMut = useMutation({
    mutationFn: (d: { name: string; color: string; icon: string }) => categoriesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setShowForm(false)
      setName('')
      setColor('#6366f1')
      setFormError('')
    },
    onError: () => setFormError('Erreur lors de la création.'),
  })

  const deleteMut = useMutation({
    mutationFn: categoriesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  if (isLoading) return <PageSpinner />

  const categories = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-400">{categories.length} catégorie{categories.length > 1 ? 's' : ''}</p>
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
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
            <Button type="submit" loading={createMut.isPending}>
              Ajouter
            </Button>
            {formError && <p className="text-sm text-red-400 w-full">{formError}</p>}
          </form>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {categories.map((cat) => (
          <Card key={cat.id} className="flex items-center justify-between py-3 px-4">
            <div className="flex items-center gap-3">
              <div
                className="h-4 w-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              <div>
                <span className="text-sm text-gray-200">{cat.name}</span>
                {cat.subcategories.length > 0 && (
                  <p className="text-xs text-gray-500">
                    {cat.subcategories.length} sous-catégorie{cat.subcategories.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Supprimer la catégorie "${cat.name}" ?`)) {
                  deleteMut.mutate(cat.id)
                }
              }}
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Card>
        ))}

        {categories.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center h-40 text-gray-500">
            <Tag className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Aucune catégorie. Créez-en une.</p>
          </div>
        )}
      </div>
    </div>
  )
}
