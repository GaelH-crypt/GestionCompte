import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Plus,
  RefreshCw,
  Trash2,
  Link,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import InstitutionPickerModal from '@/components/bank-sync/InstitutionPickerModal'
import { bankSyncApi } from '@/api/bankSync'
import { accountsApi } from '@/api/accounts'
import type { BankRequisitionItem, BankAccountLinked } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  CR: 'En attente',
  LN: 'Connecté',
  EX: 'Expiré',
  RJ: 'Refusé',
  UA: 'Authentification',
  GA: 'Accès accordé',
  SA: 'Sélection de comptes',
}

const STATUS_COLORS: Record<string, string> = {
  CR: 'text-yellow-400',
  LN: 'text-green-400',
  EX: 'text-red-400',
  RJ: 'text-red-400',
  UA: 'text-blue-400',
  GA: 'text-blue-400',
  SA: 'text-blue-400',
}

export default function BankSyncPage() {
  const [showPicker, setShowPicker] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [linkingId, setLinkingId] = useState<number | null>(null)
  const [syncResults, setSyncResults] = useState<Record<number, string>>({})
  const queryClient = useQueryClient()

  const { data: requisitions = [], isLoading: loadingRequisitions } = useQuery({
    queryKey: ['bank-requisitions'],
    queryFn: () => bankSyncApi.listRequisitions().then((r) => r.data),
  })

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })
  const appAccounts = accountsData?.results ?? []

  const bankAccounts: BankAccountLinked[] = requisitions.flatMap((r) => r.bank_accounts)

  const deleteRequisitionMutation = useMutation({
    mutationFn: (id: number) => bankSyncApi.deleteRequisition(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-requisitions'] }),
  })

  const updateLinkMutation = useMutation({
    mutationFn: ({ id, linked_account }: { id: number; linked_account: number | null }) =>
      bankSyncApi.updateBankAccount(id, { linked_account }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-requisitions'] })
      setLinkingId(null)
    },
  })

  async function handleSync(bankAccount: BankAccountLinked) {
    setSyncingId(bankAccount.id)
    setSyncResults((prev) => ({ ...prev, [bankAccount.id]: '' }))
    try {
      const res = await bankSyncApi.syncBankAccount(bankAccount.id)
      const count = res.data.transactions_added
      setSyncResults((prev) => ({
        ...prev,
        [bankAccount.id]: `${count} transaction${count !== 1 ? 's' : ''} importée${count !== 1 ? 's' : ''}`,
      }))
      queryClient.invalidateQueries({ queryKey: ['bank-requisitions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch {
      setSyncResults((prev) => ({
        ...prev,
        [bankAccount.id]: 'Erreur de synchronisation',
      }))
    } finally {
      setSyncingId(null)
    }
  }

  function handleConnect(redirectUrl: string) {
    setShowPicker(false)
    window.location.href = redirectUrl
  }

  const allLinked = bankAccounts.every((a) => a.linked_account !== null)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Synchronisation bancaire</h1>
          <p className="text-sm text-gray-400 mt-1">
            Connectez vos comptes bancaires via GoCardless pour importer automatiquement vos transactions.
          </p>
        </div>
        <Button onClick={() => setShowPicker(true)}>
          <Plus className="h-4 w-4" />
          Connecter une banque
        </Button>
      </div>

      {/* Loading */}
      {loadingRequisitions && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {/* Empty state */}
      {!loadingRequisitions && requisitions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-gray-500" />
          </div>
          <h3 className="text-white font-medium mb-2">Aucune banque connectée</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-sm">
            Connectez votre banque pour importer automatiquement vos transactions. Fonctionne avec plus de 2 300 banques européennes.
          </p>
          <Button onClick={() => setShowPicker(true)}>
            <Plus className="h-4 w-4" />
            Connecter une banque
          </Button>
        </div>
      )}

      {/* Connections list */}
      {requisitions.map((req: BankRequisitionItem) => (
        <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {/* Connection header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              {req.institution_logo ? (
                <img
                  src={req.institution_logo}
                  alt={req.institution_name}
                  className="h-9 w-9 rounded-lg object-contain bg-white p-0.5 flex-shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-gray-800 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-gray-400" />
                </div>
              )}
              <div>
                <p className="text-white font-medium text-sm">{req.institution_name}</p>
                <p className={clsx('text-xs', STATUS_COLORS[req.status])}>
                  {STATUS_LABELS[req.status] ?? req.status}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Déconnecter ${req.institution_name} ? Les transactions existantes sont conservées.`)) {
                  deleteRequisitionMutation.mutate(req.id)
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
              title="Déconnecter"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Bank accounts */}
          {req.bank_accounts.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-500">
              Aucun compte disponible. Complétez l'authentification bancaire.
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {req.bank_accounts.map((acc) => {
                const lastLog = acc.recent_sync_logs?.[0]
                const syncResult = syncResults[acc.id]

                return (
                  <div key={acc.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200 truncate">{acc.name}</p>
                        {acc.iban && (
                          <p className="text-xs text-gray-500 mt-0.5 font-mono">{acc.iban}</p>
                        )}
                        {/* Link to app account */}
                        <div className="flex items-center gap-2 mt-2">
                          <Link className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                          {linkingId === acc.id ? (
                            <select
                              className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-brand-500"
                              defaultValue={acc.linked_account ?? ''}
                              onChange={(e) =>
                                updateLinkMutation.mutate({
                                  id: acc.id,
                                  linked_account: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              autoFocus
                              onBlur={() => setLinkingId(null)}
                            >
                              <option value="">— Aucun compte —</option>
                              {appAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              onClick={() => setLinkingId(acc.id)}
                              className="text-xs text-gray-400 hover:text-brand-400 transition-colors"
                            >
                              {acc.linked_account_name ?? 'Lier à un compte…'}
                            </button>
                          )}
                        </div>
                        {/* Last sync info */}
                        {acc.last_synced_at && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Clock className="h-3 w-3 text-gray-500" />
                            <span className="text-xs text-gray-500">
                              Dernière sync : {format(new Date(acc.last_synced_at), 'dd MMM à HH:mm', { locale: fr })}
                            </span>
                          </div>
                        )}
                        {lastLog && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {lastLog.status === 'success' ? (
                              <CheckCircle className="h-3 w-3 text-green-400" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-400" />
                            )}
                            <span className={clsx(
                              'text-xs',
                              lastLog.status === 'success' ? 'text-green-400' : 'text-red-400'
                            )}>
                              {lastLog.status === 'success'
                                ? `${lastLog.transactions_added} transaction${lastLog.transactions_added !== 1 ? 's' : ''} importée${lastLog.transactions_added !== 1 ? 's' : ''}`
                                : lastLog.error_message || 'Erreur'}
                            </span>
                          </div>
                        )}
                        {syncResult && (
                          <p className={clsx(
                            'text-xs mt-1',
                            syncResult.includes('Erreur') ? 'text-red-400' : 'text-green-400'
                          )}>
                            {syncResult}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSync(acc)}
                        loading={syncingId === acc.id}
                        disabled={!acc.linked_account && linkingId !== acc.id}
                        title={!acc.linked_account ? 'Liez d\'abord ce compte à un compte GestionCompte' : 'Synchroniser'}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Warning if unlinked accounts */}
      {!allLinked && bankAccounts.length > 0 && (
        <p className="text-xs text-yellow-500 text-center">
          Certains comptes bancaires ne sont pas liés à un compte GestionCompte. Cliquez sur le nom du compte pour les associer.
        </p>
      )}

      {showPicker && (
        <InstitutionPickerModal
          onClose={() => setShowPicker(false)}
          onConnect={handleConnect}
        />
      )}
    </div>
  )
}
