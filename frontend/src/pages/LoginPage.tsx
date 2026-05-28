import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TrendingUp } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await authApi.login(username, password)
      setTokens(data.access, data.refresh)
      const { data: user } = await authApi.me()
      setUser(user)
      navigate('/dashboard')
    } catch {
      setError('Identifiants incorrects. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-500/20 mb-4">
            <TrendingUp className="h-8 w-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">GestionCompte</h1>
          <p className="text-gray-400">Gérez vos finances en toute simplicité</p>
        </div>

        {/* Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              required
            />
            <Input
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 rounded-lg p-3 border border-red-800">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full mt-2" loading={loading} size="lg">
              Connexion
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          GestionCompte — Application auto-hébergée
        </p>
      </div>
    </div>
  )
}
