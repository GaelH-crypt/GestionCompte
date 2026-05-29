import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PiggyBank, Pencil, Trash2, Plus } from 'lucide-react'
import { creditsApi } from '@/api/credits'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Credit, CreditType } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  mortgage: 'Immobilier',
  auto: 'Auto',
  consumer: 'Consommation',
  other: 'Autre',
}

export default function CreditsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Credit | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: () => creditsApi.list().then((r) => r.data.results),
  })

  const deleteMut = useMutation({
    mutationFn: creditsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credits'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  if (isLoading) return <PageSpinner />

  const credits = data ?? []
  const totalMonthly = credits.reduce((s, c) => s + c.total_monthly_charge, 0)
  const totalRemaining = credits.reduce((s, c) => s + parseFloat(c.remaining_capital), 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          <Card>
            <p className="text-sm text-gray-400">Mensualités totales</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">{formatEur(totalMonthly)}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Capital restant total</p>
            <p className="text-2xl font-bold text-white mt-1">{formatEur(totalRemaining)}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Crédits actifs</p>
            <p className="text-2xl font-bold text-white mt-1">{credits.filter((c) => c.is_active).length}</p>
          </Card>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true) }} className="shrink-0 mt-auto">
          <Plus className="h-4 w-4" /> Nouveau crédit
        </Button>
      </div>

      {/* Credit cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {credits.map((credit) => {
          const pct = Math.round(
            (1 - parseFloat(credit.remaining_capital) / parseFloat(credit.initial_capital)) * 100
          )
          return (
            <Card key={credit.id}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <PiggyBank className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{credit.name}</h3>
                    <p className="text-xs text-gray-500">{CREDIT_TYPE_LABELS[credit.credit_type]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg mr-1">
                    {credit.interest_rate}%
                  </span>
                  <button
                    onClick={() => { setEditing(credit); setShowForm(true) }}
                    className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer le crédit "${credit.name}" ?`)) {
                        deleteMut.mutate(credit.id)
                      }
                    }}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Capital restant</span>
                  <span className="text-white font-medium">{formatEur(credit.remaining_capital)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Mensualité totale</span>
                  <span className="text-orange-400 font-semibold">{formatEur(credit.total_monthly_charge)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Fin estimée</span>
                  <span className="text-white">
                    {format(new Date(credit.estimated_end_date), 'MMM yyyy', { locale: fr })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Coût total</span>
                  <span className="text-gray-300">{formatEur(credit.total_cost)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Remboursé</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-500">{credit.remaining_months} mois restants</p>
              </div>
            </Card>
          )
        })}

        {credits.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center h-40 text-gray-500">
            <PiggyBank className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Aucun crédit enregistré.</p>
          </div>
        )}
      </div>

      {showForm && (
        <CreditFormModal
          credit={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['credits'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
          }}
        />
      )}
    </div>
  )
}

interface CreditFormModalProps {
  credit: Credit | null
  onClose: () => void
  onSaved: () => void
}

const sel =
  'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

function CreditFormModal({ credit, onClose, onSaved }: CreditFormModalProps) {
  const [name, setName] = useState(credit?.name ?? '')
  const [creditType, setCreditType] = useState<CreditType>(credit?.credit_type ?? 'consumer')
  const [initialCapital, setInitialCapital] = useState(credit?.initial_capital ?? '0')
  const [remainingCapital, setRemainingCapital] = useState(credit?.remaining_capital ?? '0')
  const [interestRate, setInterestRate] = useState(credit?.interest_rate ?? '0')
  const [monthlyPayment, setMonthlyPayment] = useState(credit?.monthly_payment ?? '0')
  const [insuranceMonthly, setInsuranceMonthly] = useState(credit?.insurance_monthly ?? '0')
  const [durationMonths, setDurationMonths] = useState(String(credit?.duration_months ?? ''))
  const [startDate, setStartDate] = useState(credit?.start_date ?? '')
  const [endDate, setEndDate] = useState(credit?.end_date ?? '')
  const [earlyRepayment, setEarlyRepayment] = useState(credit?.early_repayment_possible ?? true)
  const [isActive, setIsActive] = useState(credit?.is_active ?? true)
  const [notes, setNotes] = useState(credit?.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        name,
        credit_type: creditType,
        initial_capital: initialCapital,
        remaining_capital: remainingCapital,
        interest_rate: interestRate,
        monthly_payment: monthlyPayment,
        insurance_monthly: insuranceMonthly || '0',
        duration_months: Number(durationMonths),
        start_date: startDate,
        end_date: endDate || null,
        early_repayment_possible: earlyRepayment,
        is_active: isActive,
        notes,
      }
      if (credit) await creditsApi.update(credit.id, payload)
      else await creditsApi.create(payload)
      onSaved()
    } catch {
      setError('Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6 my-4">
        <h2 className="text-lg font-semibold text-white mb-5">
          {credit ? 'Modifier le crédit' : 'Nouveau crédit'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom du crédit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="ex: Prêt immobilier"
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Type</label>
            <select value={creditType} onChange={(e) => setCreditType(e.target.value as CreditType)} className={sel}>
              <option value="mortgage">Immobilier</option>
              <option value="auto">Auto</option>
              <option value="consumer">Consommation</option>
              <option value="other">Autre</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Capital initial (€)"
              type="number"
              step="0.01"
              min="0"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
              required
              placeholder="150000"
            />
            <Input
              label="Capital restant (€)"
              type="number"
              step="0.01"
              min="0"
              value={remainingCapital}
              onChange={(e) => setRemainingCapital(e.target.value)}
              required
              placeholder="120000"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Taux d'intérêt (%)"
              type="number"
              step="0.01"
              min="0"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              required
              placeholder="1.85"
            />
            <Input
              label="Mensualité hors assurance (€)"
              type="number"
              step="0.01"
              min="0"
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(e.target.value)}
              required
              placeholder="750"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Assurance mensuelle (€)"
              type="number"
              step="0.01"
              min="0"
              value={insuranceMonthly}
              onChange={(e) => setInsuranceMonthly(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Durée totale (mois)"
              type="number"
              min="1"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              required
              placeholder="240"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date de début"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <Input
              label="Date de fin (optionnel)"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={earlyRepayment}
                onChange={(e) => setEarlyRepayment(e.target.checked)}
                className="accent-brand-500"
              />
              Remboursement anticipé possible
            </label>
            {credit && (
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="accent-brand-500"
                />
                Actif
              </label>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Informations complémentaires…"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
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
