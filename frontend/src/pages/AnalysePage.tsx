import { useState, useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { BarChart2, Play, Plus, X, TrendingUp, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { transactionsApi } from '@/api/transactions'
import { accountsApi } from '@/api/accounts'
import { categoriesApi } from '@/api/categories'
import { analyseApi } from '@/api/analyse'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { AnalyseParams, Transaction, RapportResponse } from '@/types'
import { renderCategoryOptions } from '@/utils/categoryOptions'

type FilterRow = AnalyseParams & { id: string }

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)) || 0)

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function defaultRow(): FilterRow {
  return {
    id: crypto.randomUUID(),
    date_from: firstOfMonthStr(),
    date_to: todayStr(),
    account: '',
    category: '',
    transaction_type: '',
  }
}

function buildQueryParams(p: AnalyseParams): Record<string, string> {
  const out: Record<string, string> = {}
  if (p.date_from) out.date_from = p.date_from
  if (p.date_to) out.date_to = p.date_to
  if (p.account) out.account = p.account
  if (p.category) out.category = p.category
  if (p.transaction_type) out.transaction_type = p.transaction_type
  return out
}

const sel = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'
const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

export default function AnalysePage() {
  const [rows, setRows] = useState<FilterRow[]>([defaultRow()])
  const [activeRows, setActiveRows] = useState<FilterRow[] | null>(null)
  const [bilanOpen, setBilanOpen] = useState(true)

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.results),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data.results),
  })
  const accounts = accountsData ?? []
  const categories = categoriesData ?? []

  const bilanRow = rows[0]
  const { data: rapportData, isLoading: rapportLoading } = useQuery<RapportResponse>({
    queryKey: ['rapport-bilan', bilanRow.date_from, bilanRow.date_to, bilanRow.account],
    queryFn: () => {
      const params: import('@/types').RapportParams = {
        date_from: bilanRow.date_from!,
        date_to: bilanRow.date_to!,
        ...(bilanRow.account ? { account: bilanRow.account } : {}),
      }
      return analyseApi.rapport(params).then((r) => r.data)
    },
    enabled: bilanOpen && !!bilanRow.date_from && !!bilanRow.date_to,
  })

  const queryResults = useQueries({
    queries: (activeRows ?? []).map((p) => ({
      queryKey: ['analyse', p.id, p],
      queryFn: () => transactionsApi.analyse(buildQueryParams(p)).then((r) => r.data),
    })),
  })

  const isFetching = queryResults.some((r) => r.isFetching)

  const mergedData = useMemo(() => {
    if (!activeRows || queryResults.length === 0) return null
    if (queryResults.some((r) => !r.data || r.isFetching)) return null

    // Build category color map from all summaries
    const colorMap = new Map<string, string>()
    for (const r of queryResults) {
      for (const row of r.data!.summary) {
        colorMap.set(row.category_name, row.category_color)
      }
    }

    const txMap = new Map<number, Transaction>()
    for (const r of queryResults) {
      for (const tx of r.data!.transactions) {
        txMap.set(tx.id, tx)
      }
    }
    const transactions = Array.from(txMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    // Recalculate summary from merged transactions, keyed by category ID so
    // same-named subcategories under different parents stay distinct.
    const catMap = new Map<number | 'none', { name: string; total: number; count: number; color: string }>()
    for (const tx of transactions) {
      const key = tx.category ?? 'none'
      const name = tx.category_name ?? 'Sans catégorie'
      const color = colorMap.get(name) ?? '#6b7280'
      const signed = tx.transaction_type === 'income' ? parseFloat(tx.amount) : -parseFloat(tx.amount)
      const entry = catMap.get(key)
      if (entry) {
        entry.total += signed
        entry.count++
      } else {
        catMap.set(key, { name, total: signed, count: 1, color })
      }
    }
    const absoluteTotal = Array.from(catMap.values()).reduce((s, v) => s + Math.abs(v.total), 0)
    const summary = Array.from(catMap.values())
      .map((v) => ({
        category_name: v.name,
        category_color: v.color,
        count: v.count,
        total: v.total.toFixed(2),
        percentage: absoluteTotal ? ((Math.abs(v.total) / absoluteTotal) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => Math.abs(parseFloat(b.total)) - Math.abs(parseFloat(a.total)))

    return { transactions, summary }
  }, [queryResults, activeRows])

  function updateRow(idx: number, patch: Partial<AnalyseParams>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, id: r.id } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, defaultRow()])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-6 w-6 text-brand-400" />
        <h1 className="text-xl font-bold text-white">Analyse</h1>
      </div>

      {/* Bilan rapide */}
      <div className="border border-gray-800 rounded-xl overflow-hidden">
        {/* Header row — click to toggle */}
        <button
          onClick={() => setBilanOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 bg-gray-900 hover:bg-gray-800/50 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-400" />
            Bilan rapide
          </span>
          <ChevronDown className={clsx('h-4 w-4 text-gray-400 transition-transform', bilanOpen && 'rotate-180')} />
        </button>

        {bilanOpen && (
          <div className="p-5 bg-gray-900/50 space-y-4">
            {rapportLoading && (
              <div className="text-center py-4 text-gray-400 text-sm">Chargement...</div>
            )}
            {!rapportLoading && rapportData && (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Revenus</p>
                    <p className="text-lg font-bold text-green-400">{formatEur(rapportData.kpis.total_income)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Dépenses</p>
                    <p className="text-lg font-bold text-red-400">{formatEur(rapportData.kpis.total_expenses)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Solde net</p>
                    <p className={clsx('text-lg font-bold', parseFloat(rapportData.kpis.net) >= 0 ? 'text-blue-400' : 'text-red-400')}>
                      {formatEur(rapportData.kpis.net)}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Taux d'épargne</p>
                    <p className="text-lg font-bold text-brand-400">
                      {(rapportData.kpis.savings_rate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Trend chart */}
                {rapportData.monthly_trend && rapportData.monthly_trend.length > 0 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={rapportData.monthly_trend.slice(-12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => formatEur(v)} width={80} />
                      <Line type="monotone" dataKey="income" stroke="#4ade80" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="expenses" stroke="#f87171" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Filtres */}
      <Card>
        <div className="space-y-3 mb-4">
          {rows.map((row, idx) => (
            <div key={idx} className="flex items-end gap-2">
              {rows.length > 1 && (
                <span className="text-xs text-gray-500 font-mono w-4 shrink-0 pb-2.5">{idx + 1}</span>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 flex-1">
                <div className="flex flex-col gap-1">
                  {idx === 0 && <label className="text-xs text-gray-400">Date début</label>}
                  <input
                    type="date"
                    value={row.date_from}
                    onChange={(e) => updateRow(idx, { date_from: e.target.value })}
                    className={inp}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {idx === 0 && <label className="text-xs text-gray-400">Date fin</label>}
                  <input
                    type="date"
                    value={row.date_to}
                    onChange={(e) => updateRow(idx, { date_to: e.target.value })}
                    className={inp}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {idx === 0 && <label className="text-xs text-gray-400">Compte</label>}
                  <select value={row.account} onChange={(e) => updateRow(idx, { account: e.target.value })} className={sel}>
                    <option value="">Tous</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  {idx === 0 && <label className="text-xs text-gray-400">Catégorie</label>}
                  <select value={row.category} onChange={(e) => updateRow(idx, { category: e.target.value })} className={sel}>
                    <option value="">Toutes</option>
                    {renderCategoryOptions(categories)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  {idx === 0 && <label className="text-xs text-gray-400">Type</label>}
                  <select value={row.transaction_type} onChange={(e) => updateRow(idx, { transaction_type: e.target.value })} className={sel}>
                    <option value="">Tous</option>
                    <option value="expense">Dépense</option>
                    <option value="income">Revenu</option>
                    <option value="transfer">Virement</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-1 pb-0.5 shrink-0">
                <button
                  onClick={addRow}
                  className="p-2 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-gray-800 transition-colors"
                  title="Ajouter une requête"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(idx)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
                    title="Supprimer cette requête"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button onClick={() => setActiveRows(rows.map((r) => ({ ...r })))} loading={isFetching}>
          <Play className="h-4 w-4" />
          {rows.length > 1 ? `Exécuter (${rows.length} requêtes)` : 'Exécuter'}
        </Button>
      </Card>

      {isFetching && <PageSpinner />}

      {mergedData && !isFetching && (
        <>
          {/* Résumé */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Résumé par catégorie
            </h2>
            {mergedData.summary.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune transaction pour ces filtres.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Catégorie', 'Nb transactions', 'Total', '% du total'].map((h) => (
                        <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mergedData.summary.map((row) => (
                      <tr key={row.category_name} className="border-b border-gray-800/50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: row.category_color }}
                            />
                            <span className="text-sm text-gray-200">{row.category_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-400">{row.count}</td>
                        <td className={`px-4 py-2 text-sm font-semibold ${parseFloat(row.total) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatEur(row.total)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-400">{row.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Détail transactions */}
          <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-800">
              <p className="text-sm text-gray-400">{mergedData.transactions.length} transaction{mergedData.transactions.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Date', 'Libellé', 'Catégorie', 'Compte', 'Montant'].map((h) => (
                      <th key={h} className="text-left text-xs text-gray-500 font-medium px-6 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mergedData.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-6 py-3 text-sm text-gray-400 whitespace-nowrap">
                        {tx.date ? format(new Date(tx.date), 'd MMM yyyy', { locale: fr }) : '–'}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-200">{tx.description}</td>
                      <td className="px-6 py-3 text-sm text-gray-400">{tx.category_name ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-400">{tx.account_name}</td>
                      <td className={`px-6 py-3 text-sm font-semibold ${tx.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.transaction_type === 'income' ? '+' : '-'}{formatEur(tx.amount)}
                      </td>
                    </tr>
                  ))}
                  {mergedData.transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                        Aucune transaction.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {!mergedData && !isFetching && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500">
          <BarChart2 className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">Configurez les filtres et cliquez sur Exécuter.</p>
        </div>
      )}
    </div>
  )
}
