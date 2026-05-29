import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Pencil, Trash2 } from 'lucide-react'
import { recurringApi } from '@/api/recurring'
import { accountsApi } from '@/api/accounts'
import { categoriesApi } from '@/api/categories'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Frequency, RecurringTransaction } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const FREQ_LABELS: Record<Frequency, string> = {
  weekly: 'Hebdo',
  monthly: 'Mensuel',
  yearly: 'Annuel',
}

export default function RecurringPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })

  const deleteMut = useMutation({
    mutationFn: recurringApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard-history'] })
      qc.invalidateQueries({ queryKey: ['projections'] })
    },
  })

  if (isLoading) return <PageSpinner />

  const items = data ?? []
  const expenses = items.filter((r) => r.transaction_type === 'expense')
  const incomes = items.filter((r) => r.transaction_type === 'income')
  const totalExpenses = expenses.reduce((s, r) => s + parseFloat(r.amount), 0)
  const totalIncomes = incomes.reduce((s, r) => s + parseFloat(r.amount), 0)

  function openCreate() {
    setEditing(null)
    setShowForm(true)
  }

  function openEdit(item: RecurringTransaction) {
    setEditing(item)
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-400">Revenus mensuels récurrents</p>
          <p className="text-2xl font-bold text-green-400 mt-1">+{formatEur(totalIncomes)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Charges mensuelles fixes</p>
          <p className="text-2xl font-bold text-red-400 mt-1">-{formatEur(totalExpenses)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Solde récurrent net</p>
          <p className={`text-2xl font-bold mt-1 ${totalIncomes - totalExpenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalIncomes - totalExpenses >= 0 ? '+' : ''}{formatEur(totalIncomes - totalExpenses)}
          </p>
        </Card>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <p className="text-sm text-gray-400">{items.length} élément{items.length > 1 ? 's' : ''}</p>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['Nom', 'Montant', 'Type', 'Fréquence', 'Prochaine échéance', 'Compte', 'Statut', ''].map(
                  (h) => (
                    <th key={h} className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-6 py-3 text-sm text-gray-200 font-medium">{r.name}</td>
                  <td
                    className={`px-6 py-3 text-sm font-semibold ${
                      r.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {r.transaction_type === 'income' ? '+' : '-'}
                    {formatEur(r.amount)}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">
                    {r.transaction_type === 'income' ? 'Revenu' : 'Dépense'}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">{FREQ_LABELS[r.frequency]}</td>
                  <td className="px-6 py-3 text-sm text-gray-400 whitespace-nowrap">
                    {format(new Date(r.next_occurrence), 'd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">{r.account_name}</td>
                  <td className="px-6 py-3">
                    <Badge variant={r.is_active ? 'success' : 'default'}>
                      {r.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer "${r.name}" ?`)) {
                            deleteMut.mutate(r.id)
                          }
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aucune charge récurrente configurée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showForm && (
        <RecurringFormModal
          item={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['recurring'] })
            qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
            qc.invalidateQueries({ queryKey: ['dashboard-history'] })
            qc.invalidateQueries({ queryKey: ['projections'] })
          }}
        />
      )}
    </div>
  )
}

interface RecurringFormModalProps {
  item: RecurringTransaction | null
  onClose: () => void
  onSaved: () => void
}

function RecurringFormModal({ item, onClose, onSaved }: RecurringFormModalProps) {
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item?.amount ?? '')
  const [type, setType] = useState<'income' | 'expense'>(item?.transaction_type ?? 'expense')
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'monthly')
  const [nextOccurrence, setNextOccurrence] = useState(item?.next_occurrence ?? new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState<string>(item?.account ? String(item.account) : '')
  const [categoryId, setCategoryId] = useState<string>(item?.category ? String(item.category) : '')
  const [note, setNote] = useState(item?.note ?? '')
  const [isActive, setIsActive] = useState(item?.is_active ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.results),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.results),
  })

  const accounts = accountsData ?? []
  const categories = categoriesData ?? []

  const sel = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId) {
      setError('Veuillez sélectionner un compte.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload: Partial<RecurringTransaction> = {
        name,
        amount,
        transaction_type: type,
        frequency,
        next_occurrence: nextOccurrence,
        account: parseInt(accountId),
        category: categoryId ? parseInt(categoryId) : null,
        note,
        is_active: isActive,
      }
      if (item) {
        await recurringApi.update(item.id, payload)
      } else {
        await recurringApi.create(payload)
      }
      onSaved()
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-lg font-semibold text-white mb-5">
          {item ? 'Modifier la charge récurrente' : 'Nouvelle charge récurrente'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="ex: Loyer"
              className={sel}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-400">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')} className={sel}>
                <option value="expense">Dépense</option>
                <option value="income">Revenu</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-400">Fréquence</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={sel}>
                <option value="monthly">Mensuel</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="yearly">Annuel</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-400">Montant (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
                className={sel}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-400">Prochaine échéance</label>
              <input
                type="date"
                value={nextOccurrence}
                onChange={(e) => setNextOccurrence(e.target.value)}
                required
                className={sel}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Compte</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={sel} required>
              <option value="">Sélectionner un compte…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Catégorie (optionnel)</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={sel}>
              <option value="">Aucune</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Note (optionnel)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={`${sel} resize-none`}
              placeholder="Remarques…"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-700 bg-gray-800 text-brand-500"
            />
            <span className="text-sm text-gray-400">Actif</span>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" className="flex-1" loading={loading}>
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
