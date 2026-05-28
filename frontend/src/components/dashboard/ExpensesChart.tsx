import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
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
  return (
    <Card>
      <CardTitle>Dépenses par catégorie</CardTitle>
      <ResponsiveContainer width="100%" height={260}>
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
          <Legend
            formatter={(v) => <span style={{ color: '#9ca3af', fontSize: '12px' }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  )
}
