import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface StatCardProps {
  title: string
  value: string
  icon: LucideIcon
  iconBg: string
  iconColor: string
  className?: string
}

export function StatCard({ title, value, icon: Icon, iconBg, iconColor, className }: StatCardProps) {
  return (
    <Card className={clsx('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{title}</span>
        <div className={clsx('p-2 rounded-lg', iconBg)}>
          <Icon className={clsx('h-5 w-5', iconColor)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </Card>
  )
}
