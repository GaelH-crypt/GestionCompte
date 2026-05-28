import { clsx } from 'clsx'

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent',
        className
      )}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  )
}
