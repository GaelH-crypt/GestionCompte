import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Link2, Unlink } from 'lucide-react'
import { recurringApi } from '@/api/recurring'
import { transactionsApi } from '@/api/transactions'
import { Button } from '@/components/ui/Button'
import type { Transaction } from '@/types'

interface Props {
  transaction: Transaction
  onClose: () => void
}

export function LinkRecurringModal({ transaction, onClose }: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(
    transaction.recurring_transaction
  )

  const { data: recurringData } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })

  const filtered = useMemo(() => {
    const list = (recurringData ?? []).filter(
      (rt) => rt.is_active && rt.transaction_type === transaction.transaction_type
    )
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((rt) => rt.name.toLowerCase().includes(q))
  }, [recurringData, search, transaction.transaction_type])

  const linkMut = useMutation({
    mutationFn: (recurringId: number | null) =>
      transactionsApi.linkRecurring(transaction.id, recurringId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['projections'] })
      onClose()
    },
  })

  const sel =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Lier à une charge fixe</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>

        <p className="text-xs text-gray-500 -mt-2">
          Transaction : <span className="text-gray-300">{transaction.description}</span>
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une charge fixe…"
            className={`${sel} pl-9 w-full`}
          />
        </div>

        <div className="overflow-y-auto max-h-64 flex flex-col gap-1">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Aucune charge fixe compatible.</p>
          )}
          {filtered.map((rt) => (
            <button
              key={rt.id}
              onClick={() => setSelectedId(rt.id === selectedId ? null : rt.id)}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${
                selectedId === rt.id
                  ? 'bg-brand-500/20 border border-brand-500/40'
                  : 'bg-gray-800/40 hover:bg-gray-800 border border-transparent'
              }`}
            >
              <Link2 className={`h-4 w-4 flex-shrink-0 ${selectedId === rt.id ? 'text-brand-400' : 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-100 truncate">{rt.name}</p>
                <p className="text-xs text-gray-500">{rt.frequency === 'monthly' ? 'Mensuel' : rt.frequency === 'weekly' ? 'Hebdo' : 'Annuel'}</p>
              </div>
              <span className="text-sm font-semibold text-red-400 whitespace-nowrap">
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(rt.amount))}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800">
          {transaction.recurring_transaction && (
            <Button
              variant="secondary"
              onClick={() => linkMut.mutate(null)}
              loading={linkMut.isPending}
              className="w-full"
            >
              <Unlink className="h-4 w-4" /> Retirer le lien
            </Button>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button
              onClick={() => linkMut.mutate(selectedId)}
              loading={linkMut.isPending}
              disabled={selectedId === transaction.recurring_transaction}
              className="flex-1"
            >
              Lier
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
