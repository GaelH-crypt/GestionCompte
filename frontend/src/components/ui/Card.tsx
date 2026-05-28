import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className, padding = true }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-gray-900 border border-gray-800 rounded-xl',
        padding && 'p-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3 className={clsx('text-base font-semibold text-gray-100 mb-4', className)}>
      {children}
    </h3>
  )
}
