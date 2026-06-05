import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { Card, CardTitle } from '@/components/ui/Card'
import type { ProjectionPoint } from '@/types'

interface EvolutionChartProps {
  data: ProjectionPoint[]
  title?: string
}

const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload as ProjectionPoint
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>{label}</p>
      <p style={{ color: '#fff', fontWeight: 600 }}>Global : {formatEur(point.balance)}</p>
      {point.checking_balance != null && (
        <p style={{ color: '#10b981', fontWeight: 500 }}>
          CC : {formatEur(point.checking_balance)}
        </p>
      )}
      {point.events && point.events.length > 0 && (
        <>
          <hr style={{ borderColor: '#374151', margin: '6px 0' }} />
          {point.events.map((e, i) => (
            <p key={i} style={{ color: e.kind === 'income' ? '#4ade80' : '#f87171', margin: '2px 0' }}>
              {e.label} : {e.kind === 'income' ? '+' : '-'}{formatEur(e.amount)}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

export function EvolutionChart({ data, title = 'Évolution sur les 30 prochains jours' }: EvolutionChartProps) {
  const minBalance = Math.min(...data.map((d) => d.balance))
  const isNegative = minBalance < 0
  const hasChecking = data.some((d) => d.checking_balance != null)
  // Vise ~8 graduations quelle que soit la granularité (mensuelle ou quotidienne).
  const tickInterval = Math.floor(data.length / 8)

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isNegative ? '#ef4444' : '#6366f1'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isNegative ? '#ef4444' : '#6366f1'} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="checkingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} interval={tickInterval} />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
          />
          <Tooltip content={<ChartTooltip />} />
          {hasChecking && (
            <Area
              type="monotone"
              dataKey="checking_balance"
              name="Compte courant"
              stroke="#10b981"
              fill="url(#checkingGrad)"
              strokeWidth={1.5}
              dot={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="balance"
            name="Solde global"
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
