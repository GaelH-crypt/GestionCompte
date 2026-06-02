import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import { preferencesApi } from '@/api/preferences'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesApi.get().then((r) => r.data),
  })

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: (accountId: number | null) =>
      preferencesApi.patch({ primary_account: accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projections'] })
      queryClient.invalidateQueries({ queryKey: ['projections-daily-dashboard'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  if (loadingPrefs || loadingAccounts) return <PageSpinner />

  const activeAccounts = (accounts?.results ?? []).filter(
    (a) => a.is_active && a.account_type === 'checking'
  )

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    mutation.mutate(val === '' ? null : Number(val))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-brand-500/20">
          <Settings className="h-5 w-5 text-brand-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Paramètres</h1>
      </div>

      <Card>
        <CardTitle>Compte courant principal</CardTitle>
        <p className="text-sm text-gray-400 mb-4">
          Sélectionnez le compte dont le solde sera affiché séparément sur le tableau de bord et les projections.
        </p>
        <select
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          value={prefs?.primary_account ?? ''}
          onChange={handleChange}
          disabled={mutation.isPending}
        >
          <option value="">— Aucun —</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {saved && (
          <p className="text-sm text-green-400 mt-2">Paramètre enregistré.</p>
        )}
        {mutation.isError && (
          <p className="text-sm text-red-400 mt-2">Erreur lors de la sauvegarde.</p>
        )}
      </Card>
    </div>
  )
}
