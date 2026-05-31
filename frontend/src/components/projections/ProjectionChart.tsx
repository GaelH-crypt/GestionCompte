import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { ProjectionPoint } from '@/types'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload as ProjectionPoint
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>Jour : {label}</p>
      <p style={{ color: '#fff', fontWeight: 600 }}>{formatEur(point.balance)}</p>
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

interface ProjectionChartProps {
  data: ProjectionPoint[]
  showBaseline?: boolean
}

export function ProjectionChart({ data, showBaseline = false }: ProjectionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6b7280" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
        />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
        {showBaseline && (
          <Area
            type="monotone"
            dataKey="baseline_balance"
            name="Sans simulation"
            stroke="#6b7280"
            fill="url(#baseGrad)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        <Area
          type="monotone"
          dataKey="balance"
          name="Solde projeté"
          stroke="#6366f1"
          fill="url(#balGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
