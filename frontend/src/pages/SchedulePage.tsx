// frontend/src/pages/SchedulePage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { recurringApi } from '@/api/recurring'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { expandOccurrences, type ScheduleEntry } from '@/utils/schedule'
import type { Frequency } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const FREQ_LABELS: Record<Frequency, string> = { weekly: 'Hebdo', monthly: 'Mensuel', yearly: 'Annuel' }

export default function SchedulePage() {
  const [months, setMonths] = useState(3)

  const { data, isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })

  if (isLoading) return <PageSpinner />

  const items = data ?? []
  const entries = expandOccurrences(items, months)

  // Summary totals over the whole window
  const totalExpenses = entries
    .filter((e) => e.recurring.transaction_type === 'expense')
    .reduce((s, e) => s + parseFloat(e.recurring.amount), 0)
  const totalIncomes = entries
    .filter((e) => e.recurring.transaction_type === 'income')
    .reduce((s, e) => s + parseFloat(e.recurring.amount), 0)

  // Group entries by month label
  const grouped = groupByMonth(entries)

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">Échéancier</h1>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-gray-400">Horizon :</span>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {[1, 2, 3, 6, 9, 12].map((m) => (
              <option key={m} value={m}>
                {m} mois
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-400">Revenus récurrents</p>
          <p className="text-2xl font-bold text-green-400 mt-1">+{formatEur(totalIncomes)}</p>
          <p className="text-xs text-gray-500 mt-1">sur {months} mois</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Dépenses récurrentes</p>
          <p className="text-2xl font-bold text-red-400 mt-1">-{formatEur(totalExpenses)}</p>
          <p className="text-xs text-gray-500 mt-1">sur {months} mois</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400">Solde net</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              totalIncomes - totalExpenses >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {totalIncomes - totalExpenses >= 0 ? '+' : ''}
            {formatEur(totalIncomes - totalExpenses)}
          </p>
          <p className="text-xs text-gray-500 mt-1">sur {months} mois</p>
        </Card>
      </div>

      {/* Monthly groups */}
      {grouped.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-sm text-gray-500">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Aucune échéance sur cette période.
          </div>
        </Card>
      ) : (
        grouped.map(({ label, entries: monthEntries }) => {
          const monthExpenses = monthEntries
            .filter((e) => e.recurring.transaction_type === 'expense')
            .reduce((s, e) => s + parseFloat(e.recurring.amount), 0)
          const monthIncomes = monthEntries
            .filter((e) => e.recurring.transaction_type === 'income')
            .reduce((s, e) => s + parseFloat(e.recurring.amount), 0)

          return (
            <Card key={label} padding={false}>
              {/* Month header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-800/30">
                <span className="text-sm font-semibold text-white capitalize">{label}</span>
                <div className="flex gap-4 text-sm">
                  {monthIncomes > 0 && (
                    <span className="text-green-400">+{formatEur(monthIncomes)}</span>
                  )}
                  {monthExpenses > 0 && (
                    <span className="text-red-400">-{formatEur(monthExpenses)}</span>
                  )}
                </div>
              </div>

              {/* Entries */}
              <div className="divide-y divide-gray-800/50">
                {monthEntries.map((entry) => (
                  <div
                    key={`${entry.recurring.id}-${entry.date.toISOString()}`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-gray-800/20 transition-colors"
                  >
                    {/* Date chip */}
                    <div className="w-10 text-center flex-shrink-0">
                      <span className="text-xs text-gray-500">
                        {format(entry.date, 'd', { locale: fr })}
                      </span>
                    </div>

                    {/* Name + account */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium truncate">
                        {entry.recurring.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {entry.recurring.account_name} · {FREQ_LABELS[entry.recurring.frequency]}
                      </p>
                    </div>

                    {/* Amount */}
                    <span
                      className={`text-sm font-semibold whitespace-nowrap ${
                        entry.recurring.transaction_type === 'income'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {entry.recurring.transaction_type === 'income' ? '+' : '-'}
                      {formatEur(entry.recurring.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}

interface MonthGroup {
  label: string
  entries: ScheduleEntry[]
}

function groupByMonth(entries: ScheduleEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const entry of entries) {
    const label = format(entry.date, 'MMMM yyyy', { locale: fr })
    const existing = groups.find((g) => g.label === label)
    if (existing) {
      existing.entries.push(entry)
    } else {
      groups.push({ label, entries: [entry] })
    }
  }
  return groups
}
