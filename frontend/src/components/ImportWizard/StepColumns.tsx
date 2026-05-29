import { useState } from 'react'
import type { SheetMeta, ColumnHints } from '@/types'

interface Props {
  sheets: SheetMeta[]
  onSubmit: (hints: ColumnHints) => void
  loading: boolean
}

interface ColSelectProps {
  label: string
  columns: string[]
  value: number | null
  onChange: (v: number | null) => void
}

function ColSelect({ label, columns, value, onChange }: ColSelectProps) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
      >
        <option value="">— Choisir —</option>
        {columns.map((col, i) => (
          <option key={i} value={i}>{col || `Colonne ${i + 1}`}</option>
        ))}
      </select>
    </div>
  )
}

export function StepColumns({ sheets, onSubmit, loading }: Props) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [dateCol, setDateCol] = useState<number | null>(null)
  const [descCol, setDescCol] = useState<number | null>(null)
  const [amountMode, setAmountMode] = useState<'single' | 'split'>('single')
  const [amountCol, setAmountCol] = useState<number | null>(null)
  const [debitCol, setDebitCol] = useState<number | null>(null)
  const [creditCol, setCreditCol] = useState<number | null>(null)

  const sheet = sheets[activeSheet]

  const canSubmit =
    dateCol !== null &&
    descCol !== null &&
    (amountMode === 'single' ? amountCol !== null : debitCol !== null || creditCol !== null)

  const handleSubmit = () => {
    if (!canSubmit) return
    const hints: ColumnHints = {
      sheet_name: sheet.name,
      date_col: dateCol!,
      description_col: descCol!,
      ...(amountMode === 'single'
        ? { amount_col: amountCol! }
        : {
            ...(debitCol !== null ? { debit_col: debitCol } : {}),
            ...(creditCol !== null ? { credit_col: creditCol } : {}),
          }),
    }
    onSubmit(hints)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Le format de ce fichier n'a pas été reconnu automatiquement. Indiquez quelle colonne correspond à chaque champ.
      </p>

      {sheets.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                i === activeSheet
                  ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-gray-800">
              {sheet.columns.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left text-gray-400 whitespace-nowrap font-medium">
                  {col || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.sample_rows.map((row, ri) => (
              <tr key={ri} className="border-t border-gray-800">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-gray-300 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColSelect label="Colonne Date *" columns={sheet.columns} value={dateCol} onChange={setDateCol} />
        <ColSelect label="Colonne Libellé *" columns={sheet.columns} value={descCol} onChange={setDescCol} />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">Montant :</span>
        {(['single', 'split'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setAmountMode(mode)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              amountMode === mode
                ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                : 'border-gray-700 text-gray-500 hover:border-gray-500'
            }`}
          >
            {mode === 'single' ? 'Colonne unique' : 'Débit + Crédit séparés'}
          </button>
        ))}
      </div>

      {amountMode === 'single' ? (
        <ColSelect label="Colonne Montant *" columns={sheet.columns} value={amountCol} onChange={setAmountCol} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <ColSelect label="Colonne Débit" columns={sheet.columns} value={debitCol} onChange={setDebitCol} />
          <ColSelect label="Colonne Crédit" columns={sheet.columns} value={creditCol} onChange={setCreditCol} />
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit || loading}
        onClick={handleSubmit}
        className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Analyse en cours…' : 'Suivant'}
      </button>
    </div>
  )
}
