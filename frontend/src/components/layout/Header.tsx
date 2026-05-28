import { Bell, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  const user = useAuthStore((s) => s.user)
  const { darkMode, toggleDarkMode } = useUIStore()

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-xl font-semibold text-white">{title}</h1>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Changer le thème"
        >
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-gray-700">
            <div className="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user.username[0].toUpperCase()}
            </div>
            <span className="text-sm text-gray-300 hidden sm:block">{user.username}</span>
          </div>
        )}
      </div>
    </header>
  )
}
