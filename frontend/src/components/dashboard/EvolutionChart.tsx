import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardTitle } from '@/components/ui/Card'
import type { ProjectionPoint } from '@/types'

interface EvolutionChartProps {
  data: ProjectionPoint[]
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export function EvolutionChart({ data }: EvolutionChartProps) {
  const minBalance = Math.min(...data.map((d) => d.balance))
  const isNegative = minBalance < 0

  return (
    <Card>
      <CardTitle>Évolution sur les 30 prochains jours</CardTitle>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isNegative ? '#ef4444' : '#6366f1'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isNegative ? '#ef4444' : '#6366f1'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="month"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            interval={4}
          />
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
            formatter={(v: number) => [formatEur(v), 'Solde']}
            labelFormatter={(label) => `Jour : ${label}`}
          />
          <Area
            type="monotone"
            dataKey="balance"
            name="Solde"
            stroke={isNegative ? '#ef4444' : '#6366f1'}
            fill="url(#balanceGrad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
