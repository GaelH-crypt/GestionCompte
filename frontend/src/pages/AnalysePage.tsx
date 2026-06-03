import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, Play } from 'lucide-react'
import { transactionsApi } from '@/api/transactions'
import { accountsApi } from '@/api/accounts'
import { categoriesApi } from '@/api/categories'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { AnalyseParams } from '@/types'
import { renderCategoryOptions } from '@/utils/categoryOptions'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function AnalysePage() {
  const [params, setParams] = useState<AnalyseParams>({
    date_from: firstOfMonthStr(),
    date_to: todayStr(),
    account: '',
    category: '',
    transaction_type: '',
  })
  const [activeParams, setActiveParams] = useState<AnalyseParams | null>(null)

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

  const { data, isFetching } = useQuery({
    queryKey: ['analyse', activeParams],
    queryFn: () => {
      const p: Record<string, string> = {}
      if (activeParams?.date_from) p.date_from = activeParams.date_from
      if (activeParams?.date_to) p.date_to = activeParams.date_to
      if (activeParams?.account) p.account = activeParams.account
      if (activeParams?.category) p.category = activeParams.category
      if (activeParams?.transaction_type) p.transaction_type = activeParams.transaction_type
      return transactionsApi.analyse(p).then((r) => r.data)
    },
    enabled: activeParams !== null,
  })

  const sel = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'
  const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-6 w-6 text-brand-400" />
        <h1 className="text-xl font-bold text-white">Analyse</h1>
      </div>

      {/* Filtres */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Date début</label>
            <input
              type="date"
              value={params.date_from}
              onChange={(e) => setParams((p) => ({ ...p, date_from: e.target.value }))}
              className={inp}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Date fin</label>
            <input
              type="date"
              value={params.date_to}
              onChange={(e) => setParams((p) => ({ ...p, date_to: e.target.value }))}
              className={inp}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Compte</label>
            <select value={params.account} onChange={(e) => setParams((p) => ({ ...p, account: e.target.value }))} className={sel}>
              <option value="">Tous</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Catégorie</label>
            <select value={params.category} onChange={(e) => setParams((p) => ({ ...p, category: e.target.value }))} className={sel}>
              <option value="">Toutes</option>
              {renderCategoryOptions(categories)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Type</label>
            <select value={params.transaction_type} onChange={(e) => setParams((p) => ({ ...p, transaction_type: e.target.value }))} className={sel}>
              <option value="">Tous</option>
              <option value="expense">Dépense</option>
              <option value="income">Revenu</option>
              <option value="transfer">Virement</option>
            </select>
          </div>
        </div>
        <Button onClick={() => setActiveParams({ ...params })} loading={isFetching}>
          <Play className="h-4 w-4" /> Exécuter
        </Button>
      </Card>

      {isFetching && <PageSpinner />}

      {data && !isFetching && (
        <>
          {/* Résumé */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Résumé par catégorie
            </h2>
            {data.summary.length === 0 ? (
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
                    {data.summary.map((row) => (
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
              <p className="text-sm text-gray-400">{data.transactions.length} transaction{data.transactions.length !== 1 ? 's' : ''}</p>
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
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-6 py-3 text-sm text-gray-400 whitespace-nowrap">
                        {format(new Date(tx.date), 'd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-200">{tx.description}</td>
                      <td className="px-6 py-3 text-sm text-gray-400">{tx.category_name ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-400">{tx.account_name}</td>
                      <td className={`px-6 py-3 text-sm font-semibold ${tx.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.transaction_type === 'income' ? '+' : '-'}{formatEur(tx.amount)}
                      </td>
                    </tr>
                  ))}
                  {data.transactions.length === 0 && (
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

      {!data && !isFetching && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500">
          <BarChart2 className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">Configurez les filtres et cliquez sur Exécuter.</p>
        </div>
      )}
    </div>
  )
}
