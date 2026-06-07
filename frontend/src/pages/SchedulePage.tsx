// frontend/src/pages/SchedulePage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { recurringApi } from '@/api/recurring'
import { creditsApi } from '@/api/credits'
import { Card } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'
import { expandOccurrences, expandCreditOccurrences, type AnyEntry } from '@/utils/schedule'
import type { Frequency, CreditType } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const formatEur = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(String(n)))

const FREQ_LABELS: Record<Frequency, string> = { weekly: 'Hebdo', monthly: 'Mensuel', yearly: 'Annuel' }
const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  mortgage: 'Immobilier',
  auto: 'Auto',
  consumer: 'Consommation',
  revolving: 'Revolving',
  other: 'Autre',
}

export default function SchedulePage() {
  const [months, setMonths] = useState(3)

  const { data: recurringData, isLoading: recurringLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.list().then((r) => r.data.results),
  })

  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ['credits'],
    queryFn: () => creditsApi.list().then((r) => r.data.results),
  })

  if (recurringLoading || creditsLoading) return <PageSpinner />

  const recurring = recurringData ?? []
  const credits = creditsData ?? []

  // Le crédit est la source unique de sa mensualité : on affiche tous les
  // crédits, et on ignore les récurrences liées à un crédit (redondantes).
  const standaloneRecurring = recurring.filter((r) => r.credit === null)

  const recurringEntries = expandOccurrences(standaloneRecurring, months)
  const creditEntries = expandCreditOccurrences(credits, months)

  const allEntries: AnyEntry[] = [...recurringEntries, ...creditEntries].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  )

  const totalExpenses = allEntries
    .filter((e) =>
      (e.kind === 'recurring' && e.recurring.transaction_type === 'expense') ||
      e.kind === 'credit'
    )
    .reduce((s, e) => s + (e.kind === 'recurring' ? parseFloat(e.recurring.amount) : e.credit.total_monthly_charge), 0)

  const totalIncomes = allEntries
    .filter((e) => e.kind === 'recurring' && e.recurring.transaction_type === 'income')
    .reduce((s, e) => s + (e.kind === 'recurring' ? parseFloat(e.recurring.amount) : 0), 0)

  const grouped = groupByMonth(allEntries)

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
          <p className="text-xs text-gray-500 mt-1">sur {months} mois (dont crédits)</p>
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
          const monthExpenses =
            monthEntries
              .filter((e) =>
                (e.kind === 'recurring' && e.recurring.transaction_type === 'expense') ||
                e.kind === 'credit'
              )
              .reduce(
                (s, e) =>
                  s + (e.kind === 'recurring' ? parseFloat(e.recurring.amount) : e.credit.total_monthly_charge),
                0
              )
          const monthIncomes = monthEntries
            .filter((e) => e.kind === 'recurring' && e.recurring.transaction_type === 'income')
            .reduce((s, e) => s + (e.kind === 'recurring' ? parseFloat(e.recurring.amount) : 0), 0)

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
                  <EntryRow key={entryKey(entry)} entry={entry} />
                ))}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}

function entryKey(entry: AnyEntry): string {
  if (entry.kind === 'recurring') return `r-${entry.recurring.id}-${entry.date.toISOString()}`
  return `c-${entry.credit.id}-${entry.date.toISOString()}`
}

function EntryRow({ entry }: { entry: AnyEntry }) {
  if (entry.kind === 'credit') {
    return (
      <div className="flex items-center gap-4 px-6 py-3 hover:bg-gray-800/20 transition-colors">
        <div className="w-10 text-center flex-shrink-0">
          <span className="text-xs text-gray-500">{format(entry.date, 'd', { locale: fr })}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 font-medium truncate">{entry.credit.name}</p>
          <p className="text-xs text-gray-500">
            {CREDIT_TYPE_LABELS[entry.credit.credit_type]} · Mensuel
          </p>
        </div>
        <span className="text-sm font-semibold whitespace-nowrap text-orange-400">
          -{formatEur(entry.credit.total_monthly_charge)}
        </span>
      </div>
    )
  }

  const r = entry.recurring
  return (
    <div className="flex items-center gap-4 px-6 py-3 hover:bg-gray-800/20 transition-colors">
      <div className="w-10 text-center flex-shrink-0">
        <span className="text-xs text-gray-500">{format(entry.date, 'd', { locale: fr })}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200 font-medium truncate">{r.name}</p>
        <p className="text-xs text-gray-500">
          {r.account_name} · {FREQ_LABELS[r.frequency]}
        </p>
      </div>
      <span
        className={`text-sm font-semibold whitespace-nowrap ${
          r.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {r.transaction_type === 'income' ? '+' : '-'}
        {formatEur(r.amount)}
      </span>
    </div>
  )
}

interface MonthGroup {
  label: string
  entries: AnyEntry[]
}

function groupByMonth(entries: AnyEntry[]): MonthGroup[] {
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
