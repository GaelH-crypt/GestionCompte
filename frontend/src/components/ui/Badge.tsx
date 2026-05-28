import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info'
  className?: string
}

const variants = {
  default: 'bg-gray-800 text-gray-300',
  success: 'bg-green-900/30 text-green-400',
  danger: 'bg-red-900/30 text-red-400',
  warning: 'bg-yellow-900/30 text-yellow-400',
  info: 'bg-blue-900/30 text-blue-400',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
