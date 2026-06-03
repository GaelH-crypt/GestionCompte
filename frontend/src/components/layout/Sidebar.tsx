import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  Tag,
  RefreshCw,
  TrendingUp,
  Beaker,
  LogOut,
  ChevronLeft,
  PiggyBank,
  CalendarDays,
  Building2,
  Settings,
  BarChart2,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { authApi } from '@/api/auth'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/accounts', icon: CreditCard, label: 'Comptes' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/categories', icon: Tag, label: 'Catégories' },
  { to: '/credits', icon: PiggyBank, label: 'Crédits' },
  { to: '/recurring', icon: RefreshCw, label: 'Flux récurrents' },
  { to: '/schedule', icon: CalendarDays, label: 'Échéancier' },
  { to: '/projections', icon: TrendingUp, label: 'Projections' },
  { to: '/simulations', icon: Beaker, label: 'Simulations' },
  { to: '/analyse', icon: BarChart2, label: 'Analyse' },
  { to: '/bank-sync', icon: Building2, label: 'Sync bancaire' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
]

export default function Sidebar() {
  const { logout, refreshToken } = useAuthStore()
  const { sidebarOpen, toggleSidebar } = useUIStore()

  async function handleLogout() {
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {})
    }
    logout()
  }

  return (
    <aside
      className={clsx(
        'hidden md:flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-300 flex-shrink-0',
        sidebarOpen ? 'w-60' : 'w-16'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 h-16">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm">GestionCompte</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ml-auto"
          title={sidebarOpen ? 'Réduire' : 'Agrandir'}
        >
          <ChevronLeft
            className={clsx('h-5 w-5 transition-transform duration-300', !sidebarOpen && 'rotate-180')}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={!sidebarOpen ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-500/20 text-brand-400 border border-brand-500/20'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              )
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {sidebarOpen && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-gray-800">
        <button
          onClick={handleLogout}
          title={!sidebarOpen ? 'Déconnexion' : undefined}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {sidebarOpen && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  )
}
