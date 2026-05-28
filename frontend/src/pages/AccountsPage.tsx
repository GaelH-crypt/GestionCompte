import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, CreditCard } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Account, AccountType } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Courant',
  savings: 'Épargne',
  cash: 'Espèces',
  other: 'Autre',
}

export default function AccountsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.results),
  })

  const deleteMut = useMutation({
    mutationFn: accountsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  if (isLoading) return <PageSpinner />

  const accounts = data ?? []
  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">Solde total</p>
          <p className="text-3xl font-bold text-white">{formatEur(totalBalance)}</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> Nouveau compte
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((account) => (
          <Card key={account.id}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: account.color + '33' }}
                >
                  <CreditCard className="h-5 w-5" style={{ color: account.color }} />
                </div>
                <div>
                  <p className="font-semibold text-white">{account.name}</p>
                  <p className="text-xs text-gray-500">{ACCOUNT_TYPE_LABELS[account.account_type]}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setEditing(account); setShowForm(true) }}
                  className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Supprimer le compte "${account.name}" ?`)) {
                      deleteMut.mutate(account.id)
                    }
                  }}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p
              className={`text-2xl font-bold ${
                account.current_balance >= 0 ? 'text-white' : 'text-red-400'
              }`}
            >
              {formatEur(account.current_balance)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Solde initial : {formatEur(account.initial_balance)}
            </p>
          </Card>
        ))}

        {accounts.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center h-40 text-gray-500">
            <CreditCard className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Aucun compte. Créez-en un pour commencer.</p>
          </div>
        )}
      </div>

      {showForm && (
        <AccountFormModal
          account={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['accounts'] })
          }}
        />
      )}
    </div>
  )
}

interface AccountFormModalProps {
  account: Account | null
  onClose: () => void
  onSaved: () => void
}

function AccountFormModal({ account, onClose, onSaved }: AccountFormModalProps) {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.account_type ?? 'checking')
  const [balance, setBalance] = useState(account?.initial_balance ?? '0')
  const [color, setColor] = useState(account?.color ?? '#6366f1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const sel =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = { name, account_type: type, initial_balance: balance, color, icon: 'CreditCard' }
      if (account) await accountsApi.update(account.id, payload)
      else await accountsApi.create(payload)
      onSaved()
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-5">
          {account ? 'Modifier le compte' : 'Nouveau compte'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom du compte"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="ex: Compte Courant BNP"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)} className={sel}>
              <option value="checking">Courant</option>
              <option value="savings">Épargne</option>
              <option value="cash">Espèces</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <Input
            label="Solde initial (€)"
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Couleur</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-700 bg-gray-800 cursor-pointer p-1"
            />
          </div>
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
