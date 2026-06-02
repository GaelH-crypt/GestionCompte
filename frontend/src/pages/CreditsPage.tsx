import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PiggyBank, Pencil, Trash2, Plus } from 'lucide-react'
import { creditsApi } from '@/api/credits'
import { recurringApi } from '@/api/recurring'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Credit, CreditType, RecurringTransaction } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

function computeMonthlyBreakdown(credit: Credit) {
  if (!credit.remaining_capital || !credit.interest_rate || !credit.monthly_payment) {
    return { interest: 0, capital: 0, insurance: parseFloat(credit.insurance_monthly) }
  }
  const monthlyRate = parseFloat(credit.interest_rate) / 1200
  const interest = parseFloat(credit.remaining_capital) * monthlyRate
  const capital = parseFloat(credit.monthly_payment) - interest
  const insurance = parseFloat(credit.insurance_monthly)
  return {
    interest: Math.max(0, interest),
    capital: Math.max(0, capital),
    insurance,
  }
}

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  mortgage: 'Immobilier',
  auto: 'Auto',
  consumer: 'Consommation',
  revolving: 'Revolving',
  other: 'Autre',
}

function CapacityBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(used)} utilisés</span>
        <span>max {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(max)}</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(max - used)} disponibles
      </p>
    </div>
  )
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

  const [showDrawForm, setShowDrawForm] = useState<number | null>(null)
  const [drawForm, setDrawForm] = useState({ amount: '', monthly_payment: '', duration_months: '', start_date: '' })

  const createDrawMut = useMutation({
    mutationFn: ({ creditId, data }: { creditId: number; data: typeof drawForm }) =>
      creditsApi.draws.create(creditId, {
        amount: data.amount,
        monthly_payment: data.monthly_payment,
        duration_months: Number(data.duration_months),
        start_date: data.start_date,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credits'] })
      setShowDrawForm(null)
      setDrawForm({ amount: '', monthly_payment: '', duration_months: '', start_date: '' })
    },
  })

  const deleteDrawMut = useMutation({
    mutationFn: ({ creditId, drawId }: { creditId: number; drawId: number }) =>
      creditsApi.draws.delete(creditId, drawId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credits'] }),
  })

  const { data: recurringData } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })
  const allRecurring: RecurringTransaction[] = recurringData ?? []

  if (isLoading) return <PageSpinner />

  const credits = data ?? []
  const totalMonthly = credits.reduce((s, c) => s + c.total_monthly_charge, 0)
  const totalRemaining = credits.reduce((s, c) => s + parseFloat(c.remaining_capital ?? '0'), 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-start justify-between gap-4">
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
          const pct = credit.remaining_capital && credit.initial_capital
            ? Math.round((1 - parseFloat(credit.remaining_capital) / parseFloat(credit.initial_capital)) * 100)
            : 0
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
                  {credit.interest_rate != null && (
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg mr-1">
                      {credit.interest_rate}%
                    </span>
                  )}
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
                {credit.remaining_capital != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Capital restant</span>
                    <span className="text-white font-medium">{formatEur(credit.remaining_capital)}</span>
                  </div>
                )}
                {(() => {
                  const bd = computeMonthlyBreakdown(credit)
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Mensualité totale</span>
                        <span className="text-orange-400 font-semibold">{formatEur(credit.total_monthly_charge)}</span>
                      </div>
                      <div className="flex justify-between text-xs pl-3">
                        <span className="text-gray-500">dont capital</span>
                        <span className="text-gray-400">{formatEur(bd.capital)}</span>
                      </div>
                      <div className="flex justify-between text-xs pl-3">
                        <span className="text-gray-500">dont intérêts</span>
                        <span className="text-gray-400">{formatEur(bd.interest)}</span>
                      </div>
                      {bd.insurance > 0 && (
                        <div className="flex justify-between text-xs pl-3">
                          <span className="text-gray-500">dont assurance</span>
                          <span className="text-gray-400">{formatEur(bd.insurance)}</span>
                        </div>
                      )}
                    </>
                  )
                })()}
                {credit.estimated_end_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Fin estimée</span>
                    <span className="text-white">
                      {format(new Date(credit.estimated_end_date), 'MMM yyyy', { locale: fr })}
                    </span>
                  </div>
                )}
                {credit.total_cost != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Coût total</span>
                    <span className="text-gray-300">{formatEur(credit.total_cost)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Remboursé</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                {credit.remaining_months != null && (
                  <p className="text-xs text-gray-500">{credit.remaining_months} mois restants</p>
                )}
              </div>

              {/* Revolving section */}
              {credit.credit_type === 'revolving' && credit.max_amount != null && (
                <div className="mt-4 space-y-3 border-t border-gray-700 pt-3">
                  <CapacityBar
                    used={parseFloat(credit.max_amount) - (credit.available_capacity ?? parseFloat(credit.max_amount))}
                    max={parseFloat(credit.max_amount)}
                  />

                  {credit.draws.filter(d => d.is_active).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Tirages actifs</p>
                      {credit.draws.filter(d => d.is_active).map((draw) => (
                        <div key={draw.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-sm text-white font-medium">{formatEur(draw.amount)}</p>
                            <p className="text-xs text-gray-500">{draw.duration_months} mois · {formatEur(draw.monthly_payment)}/mois</p>
                          </div>
                          <button
                            onClick={() => deleteDrawMut.mutate({ creditId: credit.id, drawId: draw.id })}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showDrawForm === credit.id ? (
                    <div className="space-y-2 border border-gray-700 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-400">Nouveau tirage</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder="Montant (€)"
                          value={drawForm.amount}
                          onChange={(e) => setDrawForm({ ...drawForm, amount: e.target.value })}
                        />
                        <Input
                          type="number"
                          placeholder="Mensualité (€)"
                          value={drawForm.monthly_payment}
                          onChange={(e) => setDrawForm({ ...drawForm, monthly_payment: e.target.value })}
                        />
                        <Input
                          type="number"
                          placeholder="Durée (mois)"
                          value={drawForm.duration_months}
                          onChange={(e) => setDrawForm({ ...drawForm, duration_months: e.target.value })}
                        />
                        <Input
                          type="date"
                          value={drawForm.start_date}
                          onChange={(e) => setDrawForm({ ...drawForm, start_date: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => createDrawMut.mutate({ creditId: credit.id, data: drawForm })}
                          disabled={!drawForm.amount || !drawForm.monthly_payment || !drawForm.duration_months || !drawForm.start_date || createDrawMut.isPending}
                        >
                          Ajouter
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowDrawForm(null)}>Annuler</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowDrawForm(credit.id); setDrawForm({ amount: '', monthly_payment: '', duration_months: '', start_date: '' }) }}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Ajouter un tirage
                    </button>
                  )}
                </div>
              )}

              {/* Linked bank accounts */}
              {credit.linked_accounts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-xs text-gray-500">
                    Compte bancaire : {credit.linked_accounts.map(a => a.name).join(', ')}
                  </p>
                </div>
              )}

              {(() => {
                const linked = allRecurring.filter((r) => r.credit === credit.id)
                if (linked.length === 0) return null
                return (
                  <div className="mt-4 pt-3 border-t border-gray-800">
                    <p className="text-xs font-medium text-gray-500 mb-2">Récurrentes liées</p>
                    <div className="space-y-1">
                      {linked.map((r) => (
                        <div key={r.id} className="flex justify-between text-xs">
                          <span className="text-gray-400">{r.name}</span>
                          <span className="text-red-400">-{formatEur(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
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
  const [maxAmount, setMaxAmount] = useState<string>(credit?.max_amount ?? '')
  const [initialCapital, setInitialCapital] = useState(credit?.initial_capital ?? '')
  const [remainingCapital, setRemainingCapital] = useState(credit?.remaining_capital ?? '')
  const [interestRate, setInterestRate] = useState(credit?.interest_rate ?? '')
  const [monthlyPayment, setMonthlyPayment] = useState(credit?.monthly_payment ?? '')
  const [insuranceMonthly, setInsuranceMonthly] = useState(credit?.insurance_monthly ?? '0')
  const [durationMonths, setDurationMonths] = useState(credit?.duration_months != null ? String(credit.duration_months) : '')
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
        max_amount: creditType === 'revolving' ? (maxAmount || null) : null,
        initial_capital: creditType !== 'revolving' ? initialCapital : undefined,
        remaining_capital: creditType !== 'revolving' ? remainingCapital : undefined,
        interest_rate: creditType !== 'revolving' ? interestRate : undefined,
        monthly_payment: creditType !== 'revolving' ? monthlyPayment : undefined,
        insurance_monthly: insuranceMonthly || '0',
        duration_months: creditType !== 'revolving' ? Number(durationMonths) : undefined,
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
              <option value="revolving">Revolving</option>
              <option value="other">Autre</option>
            </select>
          </div>

          {creditType === 'revolving' && (
            <Input
              label="Plafond du crédit (€)"
              type="number"
              step="0.01"
              min="0"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="5000"
            />
          )}

          {creditType !== 'revolving' && (
            <>
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
            </>
          )}

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
