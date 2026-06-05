import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Wallet, TrendingUp, TrendingDown, Heart,
  CreditCard, RefreshCw, AlertTriangle, ArrowUpCircle, Building2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { dashboardApi } from '@/api/dashboard'
import { projectionsApi } from '@/api/projections'
import { StatCard } from '@/components/dashboard/StatCard'
import { ExpensesChart } from '@/components/dashboard/ExpensesChart'
import { EvolutionChart } from '@/components/dashboard/EvolutionChart'
import { ViewModeToggle } from '@/components/projections/ViewModeToggle'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const HORIZONS = [
  { label: '1 mois', value: 1 },
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '1 an', value: 12 },
  { label: '5 ans', value: 60 },
]

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.summary().then((r) => r.data),
  })

  const [months, setMonths] = useState(1)
  const [daily, setDaily] = useState(true)

  function selectHorizon(value: number) {
    setMonths(value)
    if (value > 6) setDaily(false)
  }

  const { data: history } = useQuery({
    // Préfixe conservé pour que l'invalidation de SettingsPage continue de matcher.
    queryKey: ['projections-daily-dashboard', months, daily],
    queryFn: () => projectionsApi.project(months, daily).then((r) => r.data),
  })

  const horizonLabel =
    HORIZONS.find((h) => h.value === months)?.label ?? `${months} mois`
  const chartTitle = daily
    ? `Évolution jour le jour (${horizonLabel})`
    : `Évolution mensuelle (${horizonLabel})`

  if (loadingSummary || !summary) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          title="Solde global"
          value={formatEur(summary.total_balance)}
          icon={Wallet}
          iconBg="bg-brand-500/20"
          iconColor="text-brand-400"
        />
        <StatCard
          title="Revenus du mois"
          value={formatEur(summary.month_income)}
          icon={TrendingUp}
          iconBg="bg-green-500/20"
          iconColor="text-green-400"
        />
        <StatCard
          title="Dépenses du mois"
          value={formatEur(summary.month_expenses)}
          icon={TrendingDown}
          iconBg="bg-red-500/20"
          iconColor="text-red-400"
        />
        <StatCard
          title="Reste à vivre"
          value={formatEur(summary.remaining_to_live)}
          icon={Heart}
          iconBg={summary.remaining_to_live >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}
          iconColor={summary.remaining_to_live >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          title="Total crédits"
          value={formatEur(summary.total_monthly_credits)}
          icon={CreditCard}
          iconBg="bg-orange-500/20"
          iconColor="text-orange-400"
        />
        <StatCard
          title="Charges mensuelles fixes"
          value={formatEur(summary.total_recurring_expenses)}
          icon={RefreshCw}
          iconBg="bg-purple-500/20"
          iconColor="text-purple-400"
        />
        {/* Tuile compte courant */}
        {summary.checking_account_balance !== null ? (
          <StatCard
            title="Solde compte courant"
            value={formatEur(summary.checking_account_balance)}
            icon={Building2}
            iconBg="bg-emerald-500/20"
            iconColor="text-emerald-400"
          />
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Solde compte courant</span>
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Building2 className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Non configuré —{' '}
              <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
                Configurer
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {HORIZONS.map((h) => (
                <button
                  key={h.value}
                  onClick={() => selectHorizon(h.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
          {history && <EvolutionChart data={history} title={chartTitle} />}
        </div>
        <ExpensesChart data={summary.expenses_by_category} />
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account balances */}
        <Card>
          <CardTitle>Soldes par compte</CardTitle>
          {summary.accounts.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun compte actif.</p>
          ) : (
            <div className="space-y-3">
              {summary.accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: acc.color }}
                    />
                    <span className="text-sm text-gray-300">{acc.name}</span>
                  </div>
                  <span
                    className={`text-sm font-semibold ${acc.balance >= 0 ? 'text-white' : 'text-red-400'}`}
                  >
                    {formatEur(acc.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming deadlines */}
        <Card>
          <CardTitle>Prochaines échéances (30j)</CardTitle>
          {summary.upcoming_deadlines.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune échéance dans les 30 prochains jours.</p>
          ) : (
            <div className="space-y-3">
              {summary.upcoming_deadlines.map((d, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {d.transaction_type === 'income'
                      ? <ArrowUpCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                    }
                    <div>
                      <p className="text-sm text-gray-200">{d.name}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(d.next_occurrence), 'd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${d.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                    {d.transaction_type === 'income' ? '+' : '-'}{formatEur(parseFloat(d.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
