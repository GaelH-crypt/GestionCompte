import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Building2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { bankSyncApi } from '@/api/bankSync'

type State = 'loading' | 'success' | 'error' | 'cancelled'

export default function BankSyncCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const ref = searchParams.get('ref')
    const error = searchParams.get('error')

    if (error) {
      setState('cancelled')
      setMessage(
        error === 'UserCancelledSession'
          ? 'Vous avez annulé la connexion.'
          : `Erreur bancaire : ${error}`
      )
      return
    }

    if (!ref) {
      setState('error')
      setMessage('Paramètre de rappel manquant.')
      return
    }

    bankSyncApi
      .callbackRequisition(ref)
      .then((res) => {
        const count = res.data.bank_accounts_created
        setMessage(
          count > 0
            ? `${count} compte${count > 1 ? 's' : ''} bancaire${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''}.`
            : 'Connexion établie. Les comptes seront disponibles prochainement.'
        )
        setState('success')
        setTimeout(() => navigate('/bank-sync'), 2500)
      })
      .catch((err) => {
        setState('error')
        setMessage(
          err?.response?.data?.error ?? 'Impossible de finaliser la connexion bancaire.'
        )
      })
  }, [searchParams, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 px-4">
      <div className="h-16 w-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-2">
        {state === 'loading' && <Spinner />}
        {state === 'success' && <CheckCircle className="h-8 w-8 text-green-400" />}
        {(state === 'error' || state === 'cancelled') && <XCircle className="h-8 w-8 text-red-400" />}
        {state === 'loading' && !true && <Building2 className="h-8 w-8 text-brand-400" />}
      </div>

      {state === 'loading' && (
        <>
          <h2 className="text-white font-semibold text-lg">Finalisation de la connexion…</h2>
          <p className="text-gray-400 text-sm">Récupération de vos comptes bancaires.</p>
        </>
      )}

      {state === 'success' && (
        <>
          <h2 className="text-white font-semibold text-lg">Connexion réussie !</h2>
          <p className="text-green-400 text-sm">{message}</p>
          <p className="text-gray-500 text-xs">Redirection en cours…</p>
        </>
      )}

      {(state === 'error' || state === 'cancelled') && (
        <>
          <h2 className="text-white font-semibold text-lg">
            {state === 'cancelled' ? 'Connexion annulée' : 'Erreur de connexion'}
          </h2>
          <p className="text-gray-400 text-sm">{message}</p>
          <Link to="/bank-sync">
            <Button variant="secondary" size="sm">Retour à la synchronisation</Button>
          </Link>
        </>
      )}
    </div>
  )
}
