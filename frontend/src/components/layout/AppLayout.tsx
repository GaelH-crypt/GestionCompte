import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNav from './BottomNav'
import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/accounts': 'Comptes',
  '/transactions': 'Transactions',
  '/categories': 'Catégories',
  '/credits': 'Crédits',
  '/recurring': 'Charges fixes',
  '/projections': 'Projections financières',
  '/simulations': 'Simulations',
  '/bank-sync': 'Synchronisation bancaire',
  '/bank-sync/callback': 'Connexion bancaire',
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'GestionCompte'
  const darkMode = useUIStore((s) => s.darkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-gray-950">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <Header title={title} />
          <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6 scrollbar-thin">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  )
}
