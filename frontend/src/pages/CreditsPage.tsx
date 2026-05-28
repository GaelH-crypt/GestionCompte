import { useQuery } from '@tanstack/react-query'
import { PiggyBank } from 'lucide-react'
import { creditsApi } from '@/api/credits'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const CREDIT_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Immobilier',
  auto: 'Auto',
  consumer: 'Consommation',
  other: 'Autre',
}

export default function CreditsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: () => creditsApi.list().then((r) => r.data.results),
  })

  if (isLoading) return <PageSpinner />

  const credits = data ?? []
  const totalMonthly = credits.reduce((s, c) => s + c.total_monthly_charge, 0)
  const totalRemaining = credits.reduce((s, c) => s + parseFloat(c.remaining_capital), 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-400">Mensualités totales</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">{formatEur(totalMonthly)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Capital restant total</p>
          <p className="text-2xl font-bold text-white mt-1">{formatEur(totalRemaining)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Nombre de crédits actifs</p>
          <p className="text-2xl font-bold text-white mt-1">{credits.filter((c) => c.is_active).length}</p>
        </Card>
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
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg">
                  {credit.interest_rate}%
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Capital restant</span>
                  <span className="text-white font-medium">{formatEur(credit.remaining_capital)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Mensualité totale</span>
                  <span className="text-orange-400 font-semibold">
                    {formatEur(credit.total_monthly_charge)}
                  </span>
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

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Remboursé</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
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
    </div>
  )
}
