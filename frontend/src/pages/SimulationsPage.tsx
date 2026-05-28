import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Beaker, Play, RotateCcw } from 'lucide-react'
import { projectionsApi } from '@/api/projections'
import { ProjectionChart } from '@/components/projections/ProjectionChart'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { ProjectionPoint } from '@/types'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const HORIZONS = [3, 6, 12, 60]
const HORIZON_LABELS: Record<number, string> = { 3: '3 mois', 6: '6 mois', 12: '1 an', 60: '5 ans' }

export default function SimulationsPage() {
  const [months, setMonths] = useState(12)
  const [income, setIncome] = useState('')
  const [expenses, setExpenses] = useState('')
  const [credits, setCredits] = useState('')
  const [result, setResult] = useState<ProjectionPoint[] | null>(null)

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
    })
  }

  function handleReset() {
    setIncome('')
    setExpenses('')
    setCredits('')
    setResult(null)
  }

  const last = result?.[result.length - 1]

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
