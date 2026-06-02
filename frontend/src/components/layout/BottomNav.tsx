import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, ArrowLeftRight, CreditCard, TrendingUp, MoreHorizontal,
  Tag, PiggyBank, RefreshCw, CalendarDays, Beaker, Building2, Settings,
} from 'lucide-react'

const MAIN_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/accounts', icon: CreditCard, label: 'Comptes' },
  { to: '/projections', icon: TrendingUp, label: 'Projections' },
]

const MORE_ITEMS = [
  { to: '/categories', icon: Tag, label: 'Catégories' },
  { to: '/credits', icon: PiggyBank, label: 'Crédits' },
  { to: '/recurring', icon: RefreshCw, label: 'Charges fixes' },
  { to: '/schedule', icon: CalendarDays, label: 'Échéancier' },
  { to: '/simulations', icon: Beaker, label: 'Simulations' },
  { to: '/bank-sync', icon: Building2, label: 'Sync bancaire' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const isMoreActive = MORE_ITEMS.some((item) => location.pathname.startsWith(item.to))

  return (
    <>
      {/* Overlay backdrop — ferme le drawer au clic en dehors */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* Drawer "Plus" */}
      {moreOpen && (
        <div className="fixed bottom-16 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50 md:hidden">
          <div className="grid grid-cols-3 gap-1 p-2">
            {MORE_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-1 px-2 py-3 rounded-lg text-xs font-medium transition-colors',
                    isActive
                      ? 'text-brand-400 bg-brand-500/10'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                  )
                }
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="text-center leading-tight">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Barre de navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-gray-900 border-t border-gray-800 flex items-center z-50 md:hidden">
        {MAIN_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs font-medium transition-colors',
                isActive ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={clsx(
            'flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs font-medium transition-colors',
            moreOpen || isMoreActive ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>Plus</span>
        </button>
      </nav>
    </>
  )
}
