import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { projectionsApi } from '@/api/projections'
import { ProjectionChart } from '@/components/projections/ProjectionChart'
import { ViewModeToggle } from '@/components/projections/ViewModeToggle'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const HORIZONS = [
  { label: '1 mois', value: 1 },
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '1 an', value: 12 },
  { label: '5 ans', value: 60 },
]

export default function ProjectionsPage() {
  const [months, setMonths] = useState(12)
  const [daily, setDaily] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['projections', months, daily],
    queryFn: () => projectionsApi.project(months, daily).then((r) => r.data),
  })

  function selectHorizon(value: number) {
    setMonths(value)
    if (value > 6) setDaily(false)
  }

  if (isLoading || !data) return <PageSpinner />

  if (!data.length) return (
    <div className="flex flex-col items-center justify-center h-60 text-gray-500">
      <p className="text-sm">Aucune projection disponible.</p>
    </div>
  )

  const isDaily = daily
  const first = data[0]
  const last = data[data.length - 1]
  const startBalance = first.balance - first.net
  const negativeCount = data.filter((d) => d.balance < 0).length
  const minBalance = Math.min(...data.map((d) => d.balance))

  const hasChecking = data.some((d) => d.checking_balance != null)
  const checkingStart = hasChecking ? (first.checking_start_balance ?? first.checking_balance ?? 0) : null
  const checkingEnd = hasChecking ? (last.checking_balance ?? 0) : null

  const horizonLabel = months === 1 ? '1 mois' : months < 12 ? `${months} mois` : months === 12 ? '1 an' : '5 ans'

  return (
    <div className="space-y-6">
      {/* Horizon selector + view mode */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {HORIZONS.map((h) => (
            <button
              key={h.value}
              onClick={() => selectHorizon(h.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                months === h.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
        <ViewModeToggle
          value={daily ? 'daily' : 'monthly'}
          onChange={(m) => setDaily(m === 'daily')}
          dailyAllowed={months <= 6}
        />
      </div>

      {/* Invite si pas de compte courant configuré */}
      {!hasChecking && (
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-400">
            Configurez un{' '}
            <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
              compte courant principal
            </Link>{' '}
            pour afficher sa projection séparément.
          </p>
        </div>
      )}

      {/* Alert solde négatif */}
      {negativeCount > 0 && (
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-800 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">
            Attention : votre solde deviendra négatif pendant{' '}
            <strong>{negativeCount} {isDaily ? 'jour' : 'mois'}{isDaily && negativeCount > 1 ? 's' : ''}</strong>{' '}
            sur cette période. Solde minimum prévu :{' '}
            <strong>{formatEur(minBalance)}</strong>.
          </p>
        </div>
      )}

      {/* KPI cards — Solde global */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Solde global</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-sm text-gray-400">Solde de départ</p>
            <p className="text-2xl font-bold text-white mt-1">{formatEur(startBalance)}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Solde prévu dans {horizonLabel}</p>
            <p className={`text-2xl font-bold mt-1 ${last.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatEur(last.balance)}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              {last.balance > startBalance ? (
                <TrendingUp className="h-4 w-4 text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
              <p className="text-sm text-gray-400">Évolution</p>
            </div>
            <p
              className={`text-2xl font-bold ${
                last.balance >= startBalance ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {last.balance >= startBalance ? '+' : ''}
              {formatEur(last.balance - startBalance)}
            </p>
          </Card>
        </div>
      </div>

      {/* KPI cards — Compte courant */}
      {hasChecking && checkingStart !== null && checkingEnd !== null && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Compte courant</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-sm text-gray-400">Solde de départ CC</p>
              <p className="text-2xl font-bold text-white mt-1">{formatEur(checkingStart)}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-400">Solde prévu CC dans {horizonLabel}</p>
              <p className={`text-2xl font-bold mt-1 ${checkingEnd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatEur(checkingEnd)}
              </p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                {checkingEnd > checkingStart ? (
                  <TrendingUp className="h-4 w-4 text-green-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                )}
                <p className="text-sm text-gray-400">Évolution CC</p>
              </div>
              <p className={`text-2xl font-bold ${checkingEnd >= checkingStart ? 'text-green-400' : 'text-red-400'}`}>
                {checkingEnd >= checkingStart ? '+' : ''}
                {formatEur(checkingEnd - checkingStart)}
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardTitle>Projection du solde</CardTitle>
        <ProjectionChart data={data} showChecking={hasChecking} />
      </Card>

      {/* Monthly table */}
      <Card padding={false}>
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-base font-semibold text-gray-100">
            {isDaily ? 'Détail journalier' : 'Détail mensuel'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {[isDaily ? 'Jour' : 'Mois', 'Revenus', 'Dépenses', 'Crédits', isDaily ? 'Net du jour' : 'Net mensuel', 'Solde cumulé'].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-gray-800/50 ${row.balance < 0 ? 'bg-red-900/10' : ''}`}
                >
                  <td className="px-6 py-3 text-sm text-gray-300 font-medium">{row.month}</td>
                  <td className="px-6 py-3 text-sm text-green-400">
                    {row.income ? `+${formatEur(row.income)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-6 py-3 text-sm text-red-400">
                    {row.expenses ? `-${formatEur(row.expenses)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-6 py-3 text-sm text-orange-400">
                    {row.credits ? `-${formatEur(row.credits)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-6 py-3 text-sm font-medium ${row.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {row.net ? `${row.net >= 0 ? '+' : ''}${formatEur(row.net)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-6 py-3 text-sm font-bold ${row.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {formatEur(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
