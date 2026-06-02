import type { ImportedAccount, AccountMapping, AccountType } from '@/types'

interface ExistingAccount {
  id: number
  name: string
  account_type: AccountType
}

interface Props {
  importedAccounts: ImportedAccount[]
  existingAccounts: ExistingAccount[]
  mapping: Record<string, AccountMapping>
  onChange: (mapping: Record<string, AccountMapping>) => void
}

const TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Courant',
  savings: 'Épargne',
  cash: 'Espèces',
  credit: 'Crédit',
  other: 'Autre',
}

function guessType(name: string): AccountType {
  const u = name.toUpperCase()
  if (u.includes('LIVRET') || u.includes('LDDS') || u.includes('EPARGNE')) return 'savings'
  if (u.includes('PRET') || u.includes('CREDIT') || u.includes('PASSEPORT')) return 'other'
  return 'checking'
}

const sel = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'

export function StepMapping({ importedAccounts, existingAccounts, mapping, onChange }: Props) {
  const update = (rib: string, patch: Partial<AccountMapping>) => {
    onChange({ ...mapping, [rib]: { ...mapping[rib], ...patch } })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Pour chaque compte détecté dans le fichier, choisissez un compte existant ou créez-en un nouveau.</p>
      {importedAccounts.map((acc) => {
        const m = mapping[acc.rib]
        return (
          <div key={acc.rib} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-200">{acc.name}</p>
              <p className="text-xs text-gray-500">{acc.rib} · solde : {acc.balance.toFixed(2)} €</p>
            </div>
            <select
              className={sel}
              value={m?.create ? '__new__' : String(m?.id ?? '')}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  update(acc.rib, { create: true, name: acc.name, account_type: guessType(acc.name), id: undefined })
                } else {
                  const found = existingAccounts.find((a) => a.id === Number(e.target.value))
                  update(acc.rib, { create: false, id: Number(e.target.value), name: found?.name ?? '', account_type: found?.account_type ?? 'checking' })
                }
              }}
            >
              <option value="">— Sélectionner —</option>
              {existingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({TYPE_LABELS[a.account_type]})</option>
              ))}
              <option value="__new__">+ Créer un nouveau compte</option>
            </select>
            {m?.create && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Nom du compte</label>
                  <input
                    className={sel}
                    value={m.name}
                    onChange={(e) => update(acc.rib, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Type</label>
                  <select
                    className={sel}
                    value={m.account_type}
                    onChange={(e) => update(acc.rib, { account_type: e.target.value as AccountType })}
                  >
                    {(Object.entries(TYPE_LABELS) as [AccountType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
