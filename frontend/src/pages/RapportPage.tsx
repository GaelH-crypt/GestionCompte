import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileBarChart,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { analyseApi } from '@/api/analyse'
import { accountsApi } from '@/api/accounts'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/authStore'
import type { RapportParams, RapportCategoryStat } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    parseFloat(String(n)) || 0
  )

const formatPct = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(n / 100)

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function firstOfQuarterStr() {
  const d = new Date()
  const quarter = Math.floor(d.getMonth() / 3)
  const month = quarter * 3 + 1
  return `${d.getFullYear()}-${String(month).padStart(2, '0')}-01`
}

function firstOfYearStr() {
  return `${new Date().getFullYear()}-01-01`
}

function prevMonthRange(): [string, string] {
  const d = new Date()
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  const month = d.getMonth() === 0 ? 12 : d.getMonth()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return [from, to]
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inp =
  'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel =
  'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'
const btnShortcut =
  'px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors'
const btnShortcutActive =
  'px-3 py-1.5 text-xs rounded-lg border border-brand-500/50 bg-brand-500/10 text-brand-400 transition-colors'

type ShortcutKey = 'ce-mois' | 'mois-precedent' | 'trimestre' | 'ytd' | 'custom'

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  color: 'green' | 'red' | 'blue' | 'brand' | 'dynamic'
  dynamicValue?: number
  comparisonValue?: number | null
  comparisonLabel?: string
}

function KpiCard({ label, value, color, dynamicValue, comparisonValue, comparisonLabel }: KpiCardProps) {
  const colorMap: Record<string, string> = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    brand: 'text-brand-400',
    dynamic: dynamicValue !== undefined && dynamicValue >= 0 ? 'text-blue-400' : 'text-red-400',
  }

  const valueCls = colorMap[color] ?? 'text-gray-100'

  let badge: ReactNode = null
  if (comparisonValue !== null && comparisonValue !== undefined) {
    const isPositive = comparisonValue >= 0
    badge = (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
          isPositive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
        }`}
      >
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isPositive ? '+' : ''}{comparisonValue.toFixed(1)}%
      </span>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueCls}`}>{value}</p>
      {badge && (
        <div className="mt-1.5 flex items-center gap-1">
          {badge}
          {comparisonLabel && <span className="text-xs text-gray-600">{comparisonLabel}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Tooltip styles ──────────────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RapportPage() {
  const userId = useAuthStore((s) => s.user?.id)

  const [dateFrom, setDateFrom] = useState(firstOfMonthStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [accountFilter, setAccountFilter] = useState('')
  const [compareMode, setCompareMode] = useState<null | 'auto' | 'custom'>(null)
  const [compareFrom, setCompareFrom] = useState('')
  const [compareTo, setCompareTo] = useState('')
  const [includeSimulated, setIncludeSimulated] = useState(false)
  const [activeShortcut, setActiveShortcut] = useState<ShortcutKey>('ce-mois')

  // Accounts for filter
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.results),
  })
  const accounts = accountsData ?? []

  // Read simulated extra_expenses from localStorage
  function getExtraExpenses(): string | undefined {
    if (!includeSimulated || !userId) return undefined
    try {
      const raw = localStorage.getItem(`simulation_extra_expenses_${userId}`)
      if (!raw) return undefined
      const items = JSON.parse(raw) as { id: string; label: string; amount: number }[]
      const total = items.reduce((s, i) => s + (i.amount || 0), 0)
      return total > 0 ? String(total) : undefined
    } catch {
      return undefined
    }
  }

  const params: RapportParams = {
    date_from: dateFrom,
    date_to: dateTo,
    ...(accountFilter ? { account: accountFilter } : {}),
    ...(includeSimulated ? { include_simulated: 'true' } : {}),
    ...(getExtraExpenses() ? { extra_expenses: getExtraExpenses() } : {}),
    ...(compareMode === 'auto' ? { compare_with: 'auto' } : {}),
    ...(compareMode === 'custom' && compareFrom && compareTo
      ? { compare_with: 'custom', compare_from: compareFrom, compare_to: compareTo }
      : {}),
  }

  const isReady = !!(dateFrom && dateTo)

  const {
    data: rapport,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['rapport', params],
    queryFn: () => analyseApi.rapport(params).then((r) => r.data),
    enabled: isReady,
  })

  // ─── Shortcut handlers ────────────────────────────────────────────────────

  function applyShortcut(key: ShortcutKey) {
    setActiveShortcut(key)
    const today = todayStr()
    if (key === 'ce-mois') {
      setDateFrom(firstOfMonthStr())
      setDateTo(today)
    } else if (key === 'mois-precedent') {
      const [f, t] = prevMonthRange()
      setDateFrom(f)
      setDateTo(t)
    } else if (key === 'trimestre') {
      setDateFrom(firstOfQuarterStr())
      setDateTo(today)
    } else if (key === 'ytd') {
      setDateFrom(firstOfYearStr())
      setDateTo(today)
    } else if (key === 'custom') {
      // keep current dates, just mark as custom
    }
  }

  // ─── Comparison delta helpers ─────────────────────────────────────────────

  function pctDelta(current: string, previous: string): number | null {
    const curr = parseFloat(current)
    const prev = parseFloat(previous)
    if (!prev || isNaN(curr) || isNaN(prev)) return null
    return ((curr - prev) / Math.abs(prev)) * 100
  }

  const hasComparison = rapport?.comparison !== null && rapport?.comparison !== undefined

  // ─── Category bar chart data ──────────────────────────────────────────────

  function buildCategoryData(
    current: RapportCategoryStat[],
    comparison: RapportCategoryStat[] | undefined
  ) {
    const compMap = new Map<string, string>()
    if (comparison) {
      for (const c of comparison) compMap.set(c.category, c.total)
    }
    return current.map((cat) => ({
      name: cat.category.length > 14 ? cat.category.slice(0, 12) + '…' : cat.category,
      fullName: cat.category,
      current: Math.abs(parseFloat(cat.total)),
      previous: compMap.has(cat.category) ? Math.abs(parseFloat(compMap.get(cat.category)!)) : undefined,
      color: cat.color,
    }))
  }

  const categoryData = rapport
    ? buildCategoryData(rapport.by_category, rapport.comparison?.by_category)
    : []

  // ─── Monthly trend data ───────────────────────────────────────────────────

  const trendData = (rapport?.monthly_trend ?? []).map((m) => ({
    month: m.month,
    revenus: parseFloat(m.income),
    depenses: Math.abs(parseFloat(m.expenses)),
  }))

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <FileBarChart className="h-6 w-6 text-brand-400" />
        <h1 className="text-xl font-bold text-white">Rapport de période</h1>
      </div>

      {/* Controls */}
      <Card>
        <div className="space-y-4">
          {/* Shortcuts */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['ce-mois', 'Ce mois'],
                ['mois-precedent', 'Mois précédent'],
                ['trimestre', 'Trimestre'],
                ['ytd', 'YTD'],
                ['custom', 'Personnalisé'],
              ] as [ShortcutKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyShortcut(key)}
                className={activeShortcut === key ? btnShortcutActive : btnShortcut}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date inputs + account */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Date début</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setActiveShortcut('custom') }}
                className={inp}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Date fin</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setActiveShortcut('custom') }}
                className={inp}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Compte</label>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className={sel}
              >
                <option value="">Tous les comptes</option>
                {accounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Comparaison</label>
              <select
                value={compareMode ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setCompareMode(v === '' ? null : (v as 'auto' | 'custom'))
                }}
                className={sel}
              >
                <option value="">Aucune</option>
                <option value="auto">Période précédente (auto)</option>
                <option value="custom">Personnalisée</option>
              </select>
            </div>
          </div>

          {/* Custom comparison dates */}
          {compareMode === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Comparer depuis</label>
                <input
                  type="date"
                  value={compareFrom}
                  onChange={(e) => setCompareFrom(e.target.value)}
                  className={inp}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Comparer jusqu'à</label>
                <input
                  type="date"
                  value={compareTo}
                  onChange={(e) => setCompareTo(e.target.value)}
                  className={inp}
                />
              </div>
            </div>
          )}

          {/* Simulations toggle */}
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={includeSimulated}
              onChange={(e) => setIncludeSimulated(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-300">Inclure les simulations</span>
          </label>
        </div>
      </Card>

      {/* Empty state */}
      {!isReady && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500">
          <FileBarChart className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">Sélectionnez une période pour afficher le rapport.</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && <PageSpinner />}

      {/* Error */}
      {isError && (
        <Card>
          <p className="text-red-400 text-sm">
            Erreur lors du chargement du rapport :{' '}
            {(error as Error)?.message ?? 'Erreur inconnue'}
          </p>
        </Card>
      )}

      {/* Results */}
      {rapport && !isLoading && (
        <>
          {/* Period label */}
          <p className="text-xs text-gray-500">
            Période : {rapport.period.from} → {rapport.period.to} ({rapport.period.days} jours)
            {hasComparison && rapport.comparison && (
              <> &nbsp;·&nbsp; Comparaison : {rapport.comparison.period.from} → {rapport.comparison.period.to}</>
            )}
          </p>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Revenus"
              value={formatEur(rapport.kpis.total_income)}
              color="green"
              comparisonValue={
                hasComparison && rapport.comparison
                  ? pctDelta(rapport.kpis.total_income, rapport.comparison.kpis.total_income)
                  : null
              }
              comparisonLabel="vs période préc."
            />
            <KpiCard
              label="Dépenses"
              value={formatEur(rapport.kpis.total_expenses)}
              color="red"
              comparisonValue={
                hasComparison && rapport.comparison
                  ? pctDelta(rapport.kpis.total_expenses, rapport.comparison.kpis.total_expenses)
                  : null
              }
              comparisonLabel="vs période préc."
            />
            <KpiCard
              label="Solde net"
              value={formatEur(rapport.kpis.net)}
              color="dynamic"
              dynamicValue={parseFloat(rapport.kpis.net)}
              comparisonValue={
                hasComparison && rapport.comparison
                  ? pctDelta(rapport.kpis.net, rapport.comparison.kpis.net)
                  : null
              }
              comparisonLabel="vs période préc."
            />
            <KpiCard
              label="Taux d'épargne"
              value={formatPct(rapport.kpis.savings_rate)}
              color="brand"
              comparisonValue={
                hasComparison && rapport.comparison
                  ? rapport.kpis.savings_rate - rapport.comparison.kpis.savings_rate
                  : null
              }
              comparisonLabel="pts vs période préc."
            />
          </div>

          {/* Additional KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Dépense journalière moy.</p>
              <p className="text-lg font-bold text-gray-100">{formatEur(rapport.kpis.avg_daily_expense)}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Charges fixes</p>
              <p className="text-lg font-bold text-gray-100">{formatPct(rapport.kpis.fixed_ratio)}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Charges variables</p>
              <p className="text-lg font-bold text-gray-100">{formatPct(rapport.kpis.variable_ratio)}</p>
            </div>
          </div>

          {/* Trend Chart */}
          {trendData.length > 0 && (
            <Card>
              <CardTitle>Évolution sur 12 mois</CardTitle>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [formatEur(value), name]}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenus"
                    name="Revenus"
                    stroke="#4ade80"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="depenses"
                    name="Dépenses"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Category Breakdown */}
          {categoryData.length > 0 && (
            <Card>
              <CardTitle>Répartition des dépenses</CardTitle>
              <ResponsiveContainer width="100%" height={Math.max(200, categoryData.length * 36)}>
                <BarChart
                  data={categoryData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => formatEur(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [formatEur(value), name]}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  {hasComparison && (
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
                  )}
                  <Bar
                    dataKey="current"
                    name="Période actuelle"
                    fill="#6366f1"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                  />
                  {hasComparison && (
                    <Bar
                      dataKey="previous"
                      name="Période comparée"
                      fill="#374151"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={20}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>

              {/* Category table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-xs text-gray-500 font-medium px-3 py-2">Catégorie</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-3 py-2">Total</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-3 py-2">%</th>
                      {hasComparison && (
                        <th className="text-right text-xs text-gray-500 font-medium px-3 py-2">Écart</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rapport.by_category.map((cat) => (
                      <tr key={cat.category} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="text-sm text-gray-200">{cat.category}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-gray-300">
                          {formatEur(cat.total)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-gray-400">
                          {cat.percentage.toFixed(1)}%
                        </td>
                        {hasComparison && (
                          <td className="px-3 py-2 text-sm text-right">
                            {cat.vs_previous !== null && cat.vs_previous !== undefined ? (
                              <span
                                className={
                                  cat.vs_previous > 0 ? 'text-red-400' : 'text-green-400'
                                }
                              >
                                {cat.vs_previous > 0 ? '▲' : '▼'}{' '}
                                {Math.abs(cat.vs_previous).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-600">
                                <Minus className="h-3 w-3 inline" />
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Comparison table */}
          {hasComparison && rapport.comparison && (
            <Card>
              <CardTitle>Comparaison des périodes</CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-xs text-gray-500 font-medium px-3 py-2">Catégorie</th>
                      <th className="text-right text-xs text-gray-500 font-medium px-3 py-2">
                        {rapport.period.from} – {rapport.period.to}
                      </th>
                      <th className="text-right text-xs text-gray-500 font-medium px-3 py-2">
                        {rapport.comparison.period.from} – {rapport.comparison.period.to}
                      </th>
                      <th className="text-right text-xs text-gray-500 font-medium px-3 py-2">Écart %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapport.by_category.map((cat) => {
                      const compCat = rapport.comparison!.by_category.find(
                        (c) => c.category === cat.category
                      )
                      return (
                        <tr key={cat.category} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="text-sm text-gray-200">{cat.category}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-right text-gray-300">
                            {formatEur(cat.total)}
                          </td>
                          <td className="px-3 py-2 text-sm text-right text-gray-400">
                            {compCat ? formatEur(compCat.total) : '–'}
                          </td>
                          <td className="px-3 py-2 text-sm text-right">
                            {cat.vs_previous !== null && cat.vs_previous !== undefined ? (
                              <span
                                className={
                                  cat.vs_previous > 0 ? 'text-red-400' : 'text-green-400'
                                }
                              >
                                {cat.vs_previous > 0 ? '+' : ''}
                                {cat.vs_previous.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-600">–</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Empty categories state */}
          {rapport.by_category.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <FileBarChart className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Aucune donnée pour cette période.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
