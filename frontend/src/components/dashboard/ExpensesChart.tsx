import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardTitle } from '@/components/ui/Card'
import type { ExpenseByCategory } from '@/types'

interface ExpensesChartProps {
  data: ExpenseByCategory[]
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export function ExpensesChart({ data }: ExpensesChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardTitle>Dépenses par catégorie</CardTitle>
        <p className="text-sm text-gray-500 text-center py-8">Aucune dépense ce mois-ci</p>
      </Card>
    )
  }

  const total = data.reduce((sum, d) => sum + d.amount, 0)

  return (
    <Card>
      <CardTitle>Dépenses par catégorie</CardTitle>
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie
            data={data.map((d) => ({ ...d, value: d.amount }))}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(v: number) => [formatEur(v), '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-400 truncate">{entry.name}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <span className="text-gray-200 font-medium">{formatEur(entry.amount)}</span>
              <span className="text-gray-500 w-8 text-right">{((entry.amount / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
