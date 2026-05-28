import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { recurringApi } from '@/api/recurring'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Frequency } from '@/types'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const FREQ_LABELS: Record<Frequency, string> = {
  weekly: 'Hebdo',
  monthly: 'Mensuel',
  yearly: 'Annuel',
}

export default function RecurringPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })

  if (isLoading) return <PageSpinner />

  const items = data ?? []
  const expenses = items.filter((r) => r.transaction_type === 'expense')
  const incomes = items.filter((r) => r.transaction_type === 'income')
  const totalExpenses = expenses.reduce((s, r) => s + parseFloat(r.amount), 0)
  const totalIncomes = incomes.reduce((s, r) => s + parseFloat(r.amount), 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-400">Revenus mensuels récurrents</p>
          <p className="text-2xl font-bold text-green-400 mt-1">+{formatEur(totalIncomes)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Charges mensuelles fixes</p>
          <p className="text-2xl font-bold text-red-400 mt-1">-{formatEur(totalExpenses)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Solde récurrent net</p>
          <p className={`text-2xl font-bold mt-1 ${totalIncomes - totalExpenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalIncomes - totalExpenses >= 0 ? '+' : ''}{formatEur(totalIncomes - totalExpenses)}
          </p>
        </Card>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['Nom', 'Montant', 'Type', 'Fréquence', 'Prochaine échéance', 'Compte', 'Statut'].map(
                  (h) => (
                    <th key={h} className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-6 py-3 text-sm text-gray-200 font-medium">{r.name}</td>
                  <td
                    className={`px-6 py-3 text-sm font-semibold ${
                      r.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {r.transaction_type === 'income' ? '+' : '-'}
                    {formatEur(r.amount)}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">
                    {r.transaction_type === 'income' ? 'Revenu' : 'Dépense'}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">{FREQ_LABELS[r.frequency]}</td>
                  <td className="px-6 py-3 text-sm text-gray-400 whitespace-nowrap">
                    {format(new Date(r.next_occurrence), 'd MMM yyyy', { locale: fr })}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400">{r.account_name}</td>
                  <td className="px-6 py-3">
                    <Badge variant={r.is_active ? 'success' : 'default'}>
                      {r.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                    <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aucune charge récurrente configurée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
