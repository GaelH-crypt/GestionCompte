import { useQuery } from '@tanstack/react-query'
import { X, CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { bankSyncApi } from '@/api/bankSync'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

interface Props {
  bankAccountId: number
  bankAccountName: string
  onClose: () => void
}

export default function SyncLogsModal({ bankAccountId, bankAccountName, onClose }: Props) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['sync-logs', bankAccountId],
    queryFn: () => bankSyncApi.getSyncLogs(bankAccountId).then((r) => r.data),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-gray-900 rounded-xl shadow-2xl border border-gray-800 flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-base">Historique de synchronisation</h2>
            <p className="text-gray-400 text-xs mt-0.5">{bankAccountName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {!isLoading && logs.length === 0 && (
            <p className="text-center text-gray-500 py-6 text-sm">Aucune synchronisation effectuée.</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
              {log.status === 'success' ? (
                <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-200">
                    {log.status === 'success'
                      ? `${log.transactions_added} transaction${log.transactions_added !== 1 ? 's' : ''} importée${log.transactions_added !== 1 ? 's' : ''}`
                      : 'Erreur'}
                  </span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {format(new Date(log.synced_at), 'dd MMM HH:mm', { locale: fr })}
                  </span>
                </div>
                {log.error_message && (
                  <p className="text-xs text-red-400 mt-1 truncate">{log.error_message}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-800 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}
