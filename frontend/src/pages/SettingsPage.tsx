import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import { preferencesApi } from '@/api/preferences'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [accountSaved, setAccountSaved] = useState(false)
  const [cycleSaved, setCycleSaved] = useState(false)

  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesApi.get().then((r) => r.data),
  })

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.results),
  })

  const accountMutation = useMutation({
    mutationFn: (accountId: number | null) =>
      preferencesApi.patch({ primary_account: accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projections'] })
      queryClient.invalidateQueries({ queryKey: ['projections-daily-dashboard'] })
      setAccountSaved(true)
      setTimeout(() => setAccountSaved(false), 3000)
    },
  })

  const cycleMutation = useMutation({
    mutationFn: (day: number) => preferencesApi.patch({ cycle_start_day: day }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projections'] })
      queryClient.invalidateQueries({ queryKey: ['projections-daily-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['balance-history'] })
      setCycleSaved(true)
      setTimeout(() => setCycleSaved(false), 3000)
    },
  })

  if (loadingPrefs || loadingAccounts) return <PageSpinner />

  const activeAccounts = (accounts ?? []).filter(
    (a) => a.is_active && a.account_type === 'checking'
  )

  function handleAccountChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    accountMutation.mutate(val === '' ? null : Number(val))
  }

  function handleCycleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    cycleMutation.mutate(Number(e.target.value))
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
          onChange={handleAccountChange}
          disabled={accountMutation.isPending}
        >
          <option value="">— Aucun —</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {accountSaved && (
          <p className="text-sm text-green-400 mt-2">Paramètre enregistré.</p>
        )}
        {accountMutation.isError && (
          <p className="text-sm text-red-400 mt-2">Erreur lors de la sauvegarde.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Début de mois budgétaire</CardTitle>
        <p className="text-sm text-gray-400 mb-4">
          Jour du mois à partir duquel commence votre cycle budgétaire. Par exemple, si vous êtes payé le 25, choisissez 25 — vos revenus et dépenses seront calculés du 25 au 24 du mois suivant.
        </p>
        <select
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          value={prefs?.cycle_start_day ?? 1}
          onChange={handleCycleChange}
          disabled={cycleMutation.isPending}
        >
          <option value={1}>1 (début du mois calendaire)</option>
          {Array.from({ length: 27 }, (_, i) => i + 2).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {cycleSaved && (
          <p className="text-sm text-green-400 mt-2">Paramètre enregistré.</p>
        )}
        {cycleMutation.isError && (
          <p className="text-sm text-red-400 mt-2">Erreur lors de la sauvegarde.</p>
        )}
      </Card>
    </div>
  )
}
