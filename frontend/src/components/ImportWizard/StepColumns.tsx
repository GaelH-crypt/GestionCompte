import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { SheetMeta, ColumnHints } from '@/types'

interface Props {
  sheets: SheetMeta[]
  onSubmit: (hints: ColumnHints) => void
  loading: boolean
}

const NONE = -1

export function StepColumns({ sheets, onSubmit, loading }: Props) {
  const [sheetIdx, setSheetIdx] = useState(0)
  const [dateCol, setDateCol] = useState<number>(NONE)
  const [descCol, setDescCol] = useState<number>(NONE)
  const [amountCol, setAmountCol] = useState<number>(NONE)
  const [debitCol, setDebitCol] = useState<number>(NONE)
  const [creditCol, setCreditCol] = useState<number>(NONE)

  const sheet = sheets[sheetIdx]
  const columns = sheet?.columns ?? []

  const canSubmit =
    dateCol !== NONE &&
    descCol !== NONE &&
    (amountCol !== NONE || (debitCol !== NONE && creditCol !== NONE))

  const handleSubmit = () => {
    if (!canSubmit) return
    const hints: ColumnHints = {
      sheet_name: sheet.name,
      date_col: dateCol,
      description_col: descCol,
      ...(amountCol !== NONE ? { amount_col: amountCol } : {}),
      ...(debitCol !== NONE ? { debit_col: debitCol } : {}),
      ...(creditCol !== NONE ? { credit_col: creditCol } : {}),
    }
    onSubmit(hints)
  }

  const colOptions = (
    <>
      <option value={NONE}>— Choisir —</option>
      {columns.map((col, i) => (
        <option key={i} value={i}>
          {col || `Colonne ${i + 1}`}
        </option>
      ))}
    </>
  )

  const selectClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500'

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Le format de ce fichier n'a pas été reconnu automatiquement. Indiquez quelles colonnes
        contiennent les informations nécessaires.
      </p>

      {sheets.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Feuille</label>
          <select
            className={selectClass}
            value={sheetIdx}
            onChange={(e) => {
              setSheetIdx(Number(e.target.value))
              setDateCol(NONE)
              setDescCol(NONE)
              setAmountCol(NONE)
              setDebitCol(NONE)
              setCreditCol(NONE)
            }}
          >
            {sheets.map((s, i) => (
              <option key={i} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Date <span className="text-red-400">*</span>
          </label>
          <select
            className={selectClass}
            value={dateCol}
            onChange={(e) => setDateCol(Number(e.target.value))}
          >
            {colOptions}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Libellé / Description <span className="text-red-400">*</span>
          </label>
          <select
            className={selectClass}
            value={descCol}
            onChange={(e) => setDescCol(Number(e.target.value))}
          >
            {colOptions}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Montant (colonne unique)
          </label>
          <select
            className={selectClass}
            value={amountCol}
            onChange={(e) => setAmountCol(Number(e.target.value))}
          >
            {colOptions}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Débit (colonne séparée)
          </label>
          <select
            className={selectClass}
            value={debitCol}
            onChange={(e) => setDebitCol(Number(e.target.value))}
          >
            {colOptions}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Crédit (colonne séparée)
          </label>
          <select
            className={selectClass}
            value={creditCol}
            onChange={(e) => setCreditCol(Number(e.target.value))}
          >
            {colOptions}
          </select>
        </div>
      </div>

      {sheet?.sample_rows?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">Aperçu des données</p>
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs text-gray-300">
              <thead>
                <tr className="bg-gray-800">
                  {columns.map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left font-medium text-gray-400 whitespace-nowrap">
                      {col || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.sample_rows.slice(0, 3).map((row, ri) => (
                  <tr key={ri} className="border-t border-gray-800">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 whitespace-nowrap text-gray-400 max-w-[150px] truncate">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-600">
        <span className="text-red-400">*</span> Requis.
        Pour le montant, choisissez soit la colonne unique, soit les colonnes débit et crédit.
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        loading={loading}
        className="w-full"
      >
        Continuer
      </Button>
    </div>
  )
}
