import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardTitle } from '@/components/ui/Card'
import type { BalanceHistoryItem } from '@/types'

interface EvolutionChartProps {
  data: BalanceHistoryItem[]
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export function EvolutionChart({ data }: EvolutionChartProps) {
  return (
    <Card>
      <CardTitle>Évolution mensuelle (12 mois)</CardTitle>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(v: number) => [formatEur(v), '']}
          />
          <Legend
            formatter={(v) => <span style={{ color: '#9ca3af', fontSize: '12px' }}>{v}</span>}
          />
          <Area
            type="monotone"
            dataKey="income"
            name="Revenus"
            stroke="#22c55e"
            fill="url(#incomeGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="expenses"
            name="Dépenses"
            stroke="#ef4444"
            fill="url(#expenseGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
