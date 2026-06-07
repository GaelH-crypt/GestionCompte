import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, CreditCard, EyeOff } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import { creditsApi } from '@/api/credits'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import type { Account, AccountType, Credit } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Courant',
  savings: 'Épargne',
  cash: 'Espèces',
  credit: 'Crédit',
  other: 'Autre',
}

interface AccountCardProps {
  account: Account
  showCreditBadge: boolean
  onIgnore: (id: number, value: boolean) => void
  onEdit: (account: Account) => void
  onDelete: (id: number, name: string) => void
}

function AccountCard({ account, showCreditBadge, onIgnore, onEdit, onDelete }: AccountCardProps) {
  return (
    <Card>
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
            <div className="flex gap-1 mt-1 flex-wrap">
              {account.is_import_ignored && (
                <span className="text-xs text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">
                  Ignoré à l'import
                </span>
              )}
              {showCreditBadge && (
                <span className="text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">
                  Compte crédit
                </span>
              )}
              {account.exclude_from_total && (
                <span className="text-xs text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">
                  Hors total
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onIgnore(account.id, !account.is_import_ignored)}
            title={account.is_import_ignored ? "Réactiver à l'import" : "Ignorer à l'import"}
            className={`p-1.5 rounded-lg transition-colors ${
              account.is_import_ignored
                ? 'text-orange-400 hover:text-orange-300 hover:bg-gray-800'
                : 'text-gray-500 hover:text-white hover:bg-gray-800'
            }`}
          >
            <EyeOff className="h-4 w-4" />
          </button>
          <button
            onClick={() => onEdit(account)}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(account.id, account.name)}
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className={`text-2xl font-bold ${account.current_balance >= 0 ? 'text-white' : 'text-red-400'}`}>
        {formatEur(account.current_balance)}
      </p>
      <p className="text-xs text-gray-500 mt-1">Solde initial : {formatEur(account.initial_balance)}</p>
    </Card>
  )
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

  const { data: creditsData } = useQuery({
    queryKey: ['credits'],
    queryFn: () => creditsApi.list().then((r) => r.data.results),
  })
  const credits = creditsData ?? []

  const ignoreMut = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      accountsApi.update(id, { is_import_ignored: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  if (isLoading) return <PageSpinner />

  const accounts = data ?? []
  const mainAccounts = accounts.filter((a) => a.account_type !== 'credit')
  const creditAccounts = accounts.filter((a) => a.account_type === 'credit')
  const totalBalance = mainAccounts
    .filter((a) => !a.exclude_from_total)
    .reduce((s, a) => s + a.current_balance, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">Solde total</p>
          <p className="text-3xl font-bold text-white">{formatEur(totalBalance)}</p>
          <p className="text-xs text-gray-500">Hors comptes crédit</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="h-4 w-4" /> Nouveau compte
        </Button>
      </div>

      <div className="space-y-8">
        {/* Comptes principaux */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mainAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              showCreditBadge={false}
              onIgnore={(id, value) => ignoreMut.mutate({ id, value })}
              onEdit={(a) => { setEditing(a); setShowForm(true) }}
              onDelete={(id, name) => {
                if (confirm(`Supprimer le compte "${name}" ?`)) deleteMut.mutate(id)
              }}
            />
          ))}
          {mainAccounts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center h-40 text-gray-500">
              <CreditCard className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Aucun compte. Créez-en un pour commencer.</p>
            </div>
          )}
        </div>

        {/* Comptes liés à un crédit */}
        {creditAccounts.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Comptes liés à un crédit
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {creditAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  showCreditBadge={true}
                  onIgnore={(id, value) => ignoreMut.mutate({ id, value })}
                  onEdit={(a) => { setEditing(a); setShowForm(true) }}
                  onDelete={(id, name) => {
                    if (confirm(`Supprimer le compte "${name}" ?`)) deleteMut.mutate(id)
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <AccountFormModal
          account={editing}
          credits={credits}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['accounts'] })
            qc.invalidateQueries({ queryKey: ['credits'] })
            qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
            qc.invalidateQueries({ queryKey: ['projections'] })
          }}
        />
      )}
    </div>
  )
}

interface AccountFormModalProps {
  account: Account | null
  credits: Credit[]
  onClose: () => void
  onSaved: () => void
}

function AccountFormModal({ account, credits, onClose, onSaved }: AccountFormModalProps) {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.account_type ?? 'checking')
  const [balance, setBalance] = useState(account?.initial_balance ?? '0')
  const [color, setColor] = useState(account?.color ?? '#6366f1')
  const [linkedCredit, setLinkedCredit] = useState<number | null>(account?.linked_credit ?? null)
  const [excludeFromTotal, setExcludeFromTotal] = useState(account?.exclude_from_total ?? false)
  const linkedCreditObj = credits.find((c) => c.id === linkedCredit) ?? null
  const [monthlyPayment, setMonthlyPayment] = useState(linkedCreditObj?.monthly_payment ?? '')
  const [insuranceMonthly, setInsuranceMonthly] = useState(linkedCreditObj?.insurance_monthly ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pré-remplir les champs du crédit quand on change le crédit lié.
  function handleLinkedCreditChange(id: number | null) {
    setLinkedCredit(id)
    const c = credits.find((x) => x.id === id) ?? null
    setMonthlyPayment(c?.monthly_payment ?? '')
    setInsuranceMonthly(c?.insurance_monthly ?? '')
  }

  const sel =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        name, account_type: type, initial_balance: balance, color,
        icon: 'CreditCard', linked_credit: linkedCredit,
        exclude_from_total: excludeFromTotal,
      }
      if (account) await accountsApi.update(account.id, payload)
      else await accountsApi.create(payload)
      // Édition inline du crédit lié : pilote la mensualité depuis la modal du compte.
      if (type === 'credit' && linkedCredit) {
        await creditsApi.update(linkedCredit, {
          monthly_payment: monthlyPayment === '' ? null : monthlyPayment,
          insurance_monthly: insuranceMonthly === '' ? '0' : insuranceMonthly,
        })
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
            <select value={type} onChange={(e) => { setType(e.target.value as AccountType); if (e.target.value !== 'credit') handleLinkedCreditChange(null) }} className={sel}>
              <option value="checking">Courant</option>
              <option value="savings">Épargne</option>
              <option value="cash">Espèces</option>
              <option value="credit">Crédit</option>
              <option value="other">Autre</option>
            </select>
          </div>
          {type === 'credit' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-400">Crédit associé</label>
              <select
                className={sel}
                value={linkedCredit ?? ''}
                onChange={(e) => handleLinkedCreditChange(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Aucun —</option>
                {credits.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {type === 'credit' && linkedCredit && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-800/30 p-3">
              <Input
                label="Mensualité (€)"
                type="number"
                step="0.01"
                min="0"
                value={monthlyPayment ?? ''}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                placeholder="0.00"
              />
              <Input
                label="Assurance mens. (€)"
                type="number"
                step="0.01"
                min="0"
                value={insuranceMonthly ?? ''}
                onChange={(e) => setInsuranceMonthly(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}
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
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeFromTotal}
              onChange={(e) => setExcludeFromTotal(e.target.checked)}
              className="rounded border-gray-700 bg-gray-800 text-brand-500"
            />
            <span className="text-sm text-gray-400">
              Ne pas compter dans le total (ex : compte d'un enfant)
            </span>
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
