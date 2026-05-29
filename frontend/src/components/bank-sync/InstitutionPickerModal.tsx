import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Search, X, Building2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { bankSyncApi } from '@/api/bankSync'
import type { BankInstitution } from '@/types'

const COUNTRIES = [
  { code: 'FR', label: 'France' },
  { code: 'BE', label: 'Belgique' },
  { code: 'CH', label: 'Suisse' },
  { code: 'DE', label: 'Allemagne' },
  { code: 'ES', label: 'Espagne' },
  { code: 'IT', label: 'Italie' },
  { code: 'GB', label: 'Royaume-Uni' },
]

interface Props {
  onClose: () => void
  onConnect: (redirectUrl: string) => void
}

export default function InstitutionPickerModal({ onClose, onConnect }: Props) {
  const [country, setCountry] = useState('FR')
  const [search, setSearch] = useState('')

  const { data: institutions = [], isLoading, isError } = useQuery({
    queryKey: ['institutions', country],
    queryFn: () => bankSyncApi.listInstitutions(country).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: (institution: BankInstitution) =>
      bankSyncApi.createRequisition({
        institution_id: institution.id,
        institution_name: institution.name,
        institution_logo: institution.logo || '',
      }).then((r) => r.data),
    onSuccess: (data) => {
      onConnect(data.redirect_url)
    },
  })

  const filtered = institutions.filter((inst) =>
    inst.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-gray-900 rounded-xl shadow-2xl border border-gray-800 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-brand-400" />
            <h2 className="text-white font-semibold text-base">Connecter une banque</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Country + Search */}
        <div className="p-4 space-y-3 border-b border-gray-800">
          <div className="flex gap-2 flex-wrap">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => { setCountry(c.code); setSearch('') }}
                className={clsx(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  country === c.code
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une banque…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Institution list */}
        <div className="overflow-y-auto flex-1 p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          )}
          {isError && (
            <p className="text-center text-red-400 py-8 text-sm">
              Impossible de charger les banques. Vérifiez vos identifiants GoCardless.
            </p>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">Aucune banque trouvée.</p>
          )}
          {filtered.map((inst) => (
            <button
              key={inst.id}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate(inst)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
            >
              {inst.logo ? (
                <img src={inst.logo} alt={inst.name} className="h-8 w-8 rounded object-contain bg-white p-0.5 flex-shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <span className="text-sm text-gray-200 truncate">{inst.name}</span>
              {createMutation.isPending && createMutation.variables?.id === inst.id && (
                <Spinner className="h-4 w-4 ml-auto flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        {createMutation.isError && (
          <div className="px-5 py-3 border-t border-gray-800">
            <p className="text-sm text-red-400">Erreur lors de la connexion. Veuillez réessayer.</p>
          </div>
        )}

        <div className="p-4 border-t border-gray-800 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
        </div>
      </div>
    </div>
  )
}
