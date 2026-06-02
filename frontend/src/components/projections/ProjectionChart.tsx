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
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>
        {label}
      </p>
      <p style={{ color: '#fff', fontWeight: 600 }}>Global : {formatEur(point.balance)}</p>
      {point.checking_balance != null && (
        <p style={{ color: '#10b981', fontWeight: 500 }}>
          CC : {formatEur(point.checking_balance)}
        </p>
      )}
      {point.baseline_balance !== undefined && (
        <p style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>
          Sans simulation : {formatEur(point.baseline_balance)}
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

interface ProjectionChartProps {
  data: ProjectionPoint[]
  showBaseline?: boolean
  showChecking?: boolean
}

export function ProjectionChart({ data, showBaseline = false, showChecking = false }: ProjectionChartProps) {
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
          <linearGradient id="checkingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
        {showChecking && (
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
          stroke="#6366f1"
          fill="url(#balGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
