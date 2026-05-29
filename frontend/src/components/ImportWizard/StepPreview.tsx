import type { ImportedTransaction, AccountMapping, Category } from '@/types'

interface Props {
  transactions: Record<string, ImportedTransaction[]>
  mapping: Record<string, AccountMapping>
  duplicateCounts: Record<string, number>
  categories: Category[]
  onChange: (rib: string, index: number, categoryId: number | null) => void
  onRecurringChange: (rib: string, index: number, isRecurring: boolean) => void
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const sel = 'bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500'

export function StepPreview({ transactions, mapping, duplicateCounts, categories, onChange, onRecurringChange }: Props) {
  const totalNew = Object.values(transactions).reduce((s, txs) => s + txs.length, 0)
  const totalDup = Object.values(duplicateCounts).reduce((s, n) => s + n, 0)

  return (
    <div className="space-y-4">
      <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg px-4 py-3 text-sm">
        <span className="text-brand-300 font-medium">{totalNew} nouvelles transactions</span>
        {totalDup > 0 && <span className="text-gray-400 ml-2">· {totalDup} doublons ignorés</span>}
      </div>

      {Object.entries(transactions).map(([rib, txs]) => {
        const accName = mapping[rib]?.name ?? rib
        if (txs.length === 0) return null
        return (
          <div key={rib} className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{accName}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Date', 'Libellé', 'Montant', 'Catégorie', 'Récurrent'].map((h) => (
                      <th key={h} className="text-left text-gray-500 px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-2 py-2 text-gray-400 whitespace-nowrap">{tx.date}</td>
                      <td className="px-2 py-2 text-gray-200 max-w-xs truncate">{tx.description}</td>
                      <td className={`px-2 py-2 font-medium whitespace-nowrap ${tx.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.transaction_type === 'expense' ? '-' : '+'}{formatEur(tx.amount)}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className={sel}
                          value={tx.category_id ?? ''}
                          onChange={(e) => onChange(rib, i, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">Sans catégorie</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={tx.is_recurring ?? false}
                          onChange={(e) => onRecurringChange(rib, i, e.target.checked)}
                          className="accent-brand-500 h-3.5 w-3.5 cursor-pointer"
                          title="Charge fixe / récurrente"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
