export type ViewMode = 'monthly' | 'daily'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  dailyAllowed: boolean
}

export function ViewModeToggle({ value, onChange, dailyAllowed }: ViewModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-gray-800 p-0.5">
      <button
        onClick={() => onChange('monthly')}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          value === 'monthly' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
        }`}
      >
        Mensuel
      </button>
      <button
        onClick={() => dailyAllowed && onChange('daily')}
        disabled={!dailyAllowed}
        title={dailyAllowed ? undefined : 'Disponible jusqu’à 6 mois'}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          value === 'daily' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
        } ${!dailyAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        Jour le jour
      </button>
    </div>
  )
}
