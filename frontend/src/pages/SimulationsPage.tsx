import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Beaker, Play, RotateCcw, Plus, Trash2 } from 'lucide-react'
import { projectionsApi } from '@/api/projections'
import { ProjectionChart } from '@/components/projections/ProjectionChart'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/store/authStore'
import type { ProjectionPoint, SimulationExpenseItem } from '@/types'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const HORIZONS = [1, 3, 6, 12, 60]
const HORIZON_LABELS: Record<number, string> = { 1: '30 jours', 3: '3 mois', 6: '6 mois', 12: '1 an', 60: '5 ans' }

function storageKey(userId: number | undefined) {
  return `simulation_extra_expenses_${userId ?? 'anon'}`
}

function loadStoredExpenses(userId: number | undefined): SimulationExpenseItem[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore parse errors
  }
  return []
}

function saveExpenses(userId: number | undefined, items: SimulationExpenseItem[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items))
}

export default function SimulationsPage() {
  const user = useAuthStore((s) => s.user)
  const [months, setMonths] = useState(12)
  const [income, setIncome] = useState('')
  const [expenses, setExpenses] = useState('')
  const [credits, setCredits] = useState('')
  const [result, setResult] = useState<ProjectionPoint[] | null>(null)

  // Extra expenses — persisted in localStorage, scoped per user
  const [extraExpenses, setExtraExpenses] = useState<SimulationExpenseItem[]>(() =>
    loadStoredExpenses(user?.id)
  )
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')

  // Reload from localStorage when the logged-in user changes
  useEffect(() => {
    setExtraExpenses(loadStoredExpenses(user?.id))
    setResult(null)
  }, [user?.id])

  function updateExtraExpenses(items: SimulationExpenseItem[]) {
    setExtraExpenses(items)
    saveExpenses(user?.id, items)
  }

  function addExpenseItem() {
    const amount = parseFloat(newAmount)
    if (!newLabel.trim() || isNaN(amount) || amount <= 0) return
    const item: SimulationExpenseItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      label: newLabel.trim(),
      amount,
    }
    updateExtraExpenses([...extraExpenses, item])
    setNewLabel('')
    setNewAmount('')
  }

  function removeExpenseItem(id: string) {
    updateExtraExpenses(extraExpenses.filter((e) => e.id !== id))
  }

  const { mutate, isPending } = useMutation({
    mutationFn: projectionsApi.simulate,
    onSuccess: (data) => setResult(data.data),
  })

  function handleSimulate() {
    mutate({
      months,
      income: income ? parseFloat(income) : undefined,
      expenses: expenses ? parseFloat(expenses) : undefined,
      credits: credits ? parseFloat(credits) : undefined,
      extra_expenses: extraExpenses.length > 0
        ? extraExpenses.map(({ label, amount }) => ({ label, amount }))
        : undefined,
    })
  }

  function handleReset() {
    setIncome('')
    setExpenses('')
    setCredits('')
    setResult(null)
  }

  const last = result?.[result.length - 1]
  const extraTotal = extraExpenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-6">
      {/* Sandbox notice */}
      <div className="flex items-start gap-3 bg-blue-900/20 border border-blue-800 rounded-xl p-4">
        <Beaker className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">
          Mode sandbox — les simulations ne modifient <strong>jamais</strong> vos vraies données.
          Modifiez les paramètres pour visualiser l'impact sur votre budget futur.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Params panel */}
        <Card>
          <CardTitle>Paramètres</CardTitle>
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Horizon</label>
              <div className="flex flex-wrap gap-2">
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setMonths(h)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      months === h
                        ? 'bg-brand-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {HORIZON_LABELS[h]}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Revenus mensuels (€)"
              type="number"
              step="0.01"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="Laisser vide = valeur réelle"
            />
            <Input
              label="Dépenses mensuelles (€)"
              type="number"
              step="0.01"
              value={expenses}
              onChange={(e) => setExpenses(e.target.value)}
              placeholder="Laisser vide = valeur réelle"
            />
            <Input
              label="Mensualités crédits (€)"
              type="number"
              step="0.01"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="Laisser vide = valeur réelle"
            />

            {/* Extra expenses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-400">
                  Dépenses supplémentaires
                </label>
                {extraTotal > 0 && (
                  <span className="text-xs text-orange-400 font-medium">
                    +{formatEur(extraTotal)}/mois
                  </span>
                )}
              </div>

              {/* Existing items */}
              {extraExpenses.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {extraExpenses.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2 text-sm"
                    >
                      <span className="text-gray-300 truncate mr-2">{item.label}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-orange-400 font-medium">{formatEur(item.amount)}</span>
                        <button
                          onClick={() => removeExpenseItem(item.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add new item */}
              <div className="space-y-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Type (ex: Carburant)"
                  className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && addExpenseItem()}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="Montant (€)"
                    className="flex-1 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && addExpenseItem()}
                  />
                  <button
                    onClick={addExpenseItem}
                    disabled={!newLabel.trim() || !newAmount || parseFloat(newAmount) <= 0}
                    className="flex items-center gap-1 px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={handleSimulate} loading={isPending} className="w-full">
                <Play className="h-4 w-4" /> Simuler
              </Button>
              {result && (
                <Button onClick={handleReset} variant="secondary" className="w-full">
                  <RotateCcw className="h-4 w-4" /> Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-5">
          {result && last ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <p className="text-xs text-gray-400 mb-1">Solde final simulé</p>
                  <p className={`text-xl font-bold ${last.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatEur(last.balance)}
                  </p>
                </Card>
                <Card>
                  <p className="text-xs text-gray-400 mb-1">Solde final réel</p>
                  <p className="text-xl font-bold text-gray-300">
                    {formatEur(last.baseline_balance ?? 0)}
                  </p>
                </Card>
                <Card>
                  <p className="text-xs text-gray-400 mb-1">Impact</p>
                  <p
                    className={`text-xl font-bold ${
                      (last.delta ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {(last.delta ?? 0) >= 0 ? '+' : ''}
                    {formatEur(last.delta ?? 0)}
                  </p>
                </Card>
              </div>

              {/* Chart */}
              <Card>
                <CardTitle>Comparaison simulation vs réalité</CardTitle>
                <ProjectionChart data={result} showBaseline={true} />
              </Card>
            </>
          ) : (
            <Card className="flex items-center justify-center h-64">
              <div className="text-center">
                <Beaker className="h-12 w-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  Ajustez les paramètres et cliquez sur Simuler pour voir les résultats.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
