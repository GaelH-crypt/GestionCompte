import { useQuery } from '@tanstack/react-query'
import {
  Wallet, TrendingUp, TrendingDown, Heart,
  CreditCard, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { projectionsApi } from '@/api/projections'
import { StatCard } from '@/components/dashboard/StatCard'
import { ExpensesChart } from '@/components/dashboard/ExpensesChart'
import { EvolutionChart } from '@/components/dashboard/EvolutionChart'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.summary().then((r) => r.data),
  })

  const { data: history } = useQuery({
    queryKey: ['projections-daily-dashboard'],
    queryFn: () => projectionsApi.project(1).then((r) => r.data),
  })

  if (loadingSummary || !summary) return <PageSpinner />

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Solde global"
          value={formatEur(summary.total_balance)}
          icon={Wallet}
          iconBg="bg-brand-500/20"
          iconColor="text-brand-400"
          className="col-span-2 md:col-span-1"
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
          title="Charges fixes"
          value={formatEur(summary.total_recurring_expenses)}
          icon={RefreshCw}
          iconBg="bg-purple-500/20"
          iconColor="text-purple-400"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {history && <EvolutionChart data={history} />}
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
                    <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-gray-200">{d.name}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(d.next_occurrence), 'd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-red-400">
                    -{formatEur(parseFloat(d.amount))}
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
