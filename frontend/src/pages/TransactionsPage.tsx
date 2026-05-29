import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Pencil, Search, Upload,
  ArrowUpCircle, ArrowDownCircle, ArrowLeftRight,
} from 'lucide-react'
import { transactionsApi } from '@/api/transactions'
import { recurringApi } from '@/api/recurring'
import { accountsApi } from '@/api/accounts'
import { categoriesApi } from '@/api/categories'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { ImportWizard } from '@/components/ImportWizard/ImportWizard'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Transaction, TransactionType, Frequency } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const TYPE_ICON: Record<TransactionType, React.ReactNode> = {
  income: <ArrowUpCircle className="h-4 w-4 text-green-400" />,
  expense: <ArrowDownCircle className="h-4 w-4 text-red-400" />,
  transfer: <ArrowLeftRight className="h-4 w-4 text-blue-400" />,
}

const TYPE_COLOR: Record<TransactionType, string> = {
  income: 'text-green-400',
  expense: 'text-red-400',
  transfer: 'text-blue-400',
}

export default function TransactionsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)

  const params: Record<string, string | number> = { page }
  if (search) params.search = search
  if (typeFilter) params.transaction_type = typeFilter

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', params],
    queryFn: () => transactionsApi.list(params).then((r) => r.data),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.results),
  })

  const deleteMut = useMutation({
    mutationFn: transactionsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const sel =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  if (isLoading && !data) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Rechercher…"
              className={`${sel} pl-9 w-56`}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className={sel}
          >
            <option value="">Tous les types</option>
            <option value="income">Revenus</option>
            <option value="expense">Dépenses</option>
            <option value="transfer">Virements</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> Importer
          </Button>
          <Button onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="h-4 w-4" /> Nouvelle transaction
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['', 'Description', 'Compte', 'Catégorie', 'Date', 'Montant', ''].map((h, i) => (
                  <th
                    key={i}
                    className="text-left text-xs text-gray-500 font-medium px-4 py-3 first:pl-6 last:pr-4"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="pl-6 pr-2 py-3">{TYPE_ICON[tx.transaction_type]}</td>
                  <td className="px-4 py-3 text-sm text-gray-200 max-w-[200px] truncate">
                    {tx.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{tx.account_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{tx.category_name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                    {format(new Date(tx.date), 'd MMM yyyy', { locale: fr })}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${TYPE_COLOR[tx.transaction_type]}`}
                  >
                    {tx.transaction_type === 'income' ? '+' : '-'}
                    {formatEur(tx.amount)}
                  </td>
                  <td className="pr-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => { setEditing(tx); setShowForm(true) }}
                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMut.mutate(tx.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.results ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                    Aucune transaction trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {data && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              {data.count} transaction{data.count > 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button size="sm" variant="secondary" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      {showForm && (
        <TransactionFormModal
          transaction={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['transactions'] })
            qc.invalidateQueries({ queryKey: ['accounts'] })
            qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
            qc.invalidateQueries({ queryKey: ['recurring'] })
          }}
        />
      )}

      <ImportWizard
        open={showImport}
        onOpenChange={setShowImport}
        categories={categoriesData ?? []}
      />
    </div>
  )
}

function TransactionFormModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: Transaction | null
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<TransactionType>(transaction?.transaction_type ?? 'expense')
  const [amount, setAmount] = useState(transaction?.amount ?? '')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [date, setDate] = useState(
    transaction?.date ?? new Date().toISOString().slice(0, 10)
  )
  const [accountId, setAccountId] = useState<number | ''>(transaction?.account ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(transaction?.category ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRecurring, setIsRecurring] = useState(transaction?.is_recurring ?? false)
  const [recurringFrequency, setRecurringFrequency] = useState<Frequency>('monthly')
  const [recurringNextOccurrence, setRecurringNextOccurrence] = useState(
    transaction?.date ?? new Date().toISOString().slice(0, 10)
  )

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.results),
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.results),
  })

  const sel =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        transaction_type: type,
        amount: String(amount),
        description,
        date,
        account: Number(accountId),
        category: categoryId ? Number(categoryId) : null,
        is_recurring: isRecurring && type !== 'transfer',
      }
      if (transaction) await transactionsApi.update(transaction.id, payload)
      else await transactionsApi.create(payload)

      if (isRecurring && type !== 'transfer') {
        try {
          await recurringApi.create({
            name: description,
            amount: String(amount),
            transaction_type: type as 'income' | 'expense',
            frequency: recurringFrequency,
            next_occurrence: recurringNextOccurrence,
            account: Number(accountId),
            category: categoryId ? Number(categoryId) : null,
          })
        } catch {
          setError('Transaction enregistrée, mais la création de la récurrente a échoué.')
          setLoading(false)
          return
        }
      }

      onSaved()
    } catch {
      setError('Une erreur est survenue. Vérifiez les données.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-5">
          {transaction ? 'Modifier la transaction' : 'Nouvelle transaction'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as TransactionType)} className={sel}>
              <option value="expense">Dépense</option>
              <option value="income">Revenu</option>
              <option value="transfer">Virement</option>
            </select>
          </div>
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="ex: Courses supermarché"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Montant (€)"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
            />
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Compte</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
              required
              className={sel}
            >
              <option value="">Choisir un compte</option>
              {(Array.isArray(accounts) ? accounts : []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Catégorie (optionnel)</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value) || '')}
              className={sel}
            >
              <option value="">Sans catégorie</option>
              {(Array.isArray(categories) ? categories : []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {type !== 'transfer' && (
            <div className="border-t border-gray-800 pt-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="accent-brand-500"
                />
                <span className="text-sm text-gray-300">Enregistrer comme récurrente</span>
              </label>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-400">Fréquence</label>
                    <select
                      value={recurringFrequency}
                      onChange={(e) => setRecurringFrequency(e.target.value as Frequency)}
                      className={sel}
                    >
                      <option value="monthly">Mensuel</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="yearly">Annuel</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-400">Prochaine échéance</label>
                    <input
                      type="date"
                      value={recurringNextOccurrence}
                      onChange={(e) => setRecurringNextOccurrence(e.target.value)}
                      className={sel}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
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
