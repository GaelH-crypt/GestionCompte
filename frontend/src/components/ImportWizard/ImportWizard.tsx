import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { importsApi } from '@/api/imports'
import { StepUpload } from './StepUpload'
import { StepColumns } from './StepColumns'
import { StepMapping } from './StepMapping'
import { StepPreview } from './StepPreview'
import { Button } from '@/components/ui/Button'
import type {
  PreviewResponse, AccountMapping, ImportedTransaction, Category,
  SheetMeta, ColumnHints, ConfirmResponse,
} from '@/types'

type Step = 'upload' | 'columns' | 'mapping' | 'preview' | 'result'

const STEP_NAMES: Record<Exclude<Step, 'result'>, string> = {
  upload: 'Fichier',
  columns: 'Colonnes',
  mapping: 'Comptes',
  preview: 'Confirmation',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: Category[]
}

function ProgressBar() {
  return (
    <div className="h-0.5 w-full bg-gray-800 overflow-hidden">
      <div className="h-full bg-brand-500 animate-slide" style={{ width: '40%' }} />
    </div>
  )
}

export function ImportWizard({ open, onOpenChange, categories }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [columnSheets, setColumnSheets] = useState<SheetMeta[] | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, AccountMapping>>({})
  const [transactions, setTransactions] = useState<Record<string, ImportedTransaction[]>>({})
  const [confirming, setConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const reset = () => {
    setStep('upload')
    setFile(null)
    setUploading(false)
    setUploadError(null)
    setColumnSheets(null)
    setPreview(null)
    setMapping({})
    setTransactions({})
    setConfirming(false)
    setConfirmResult(null)
    setConfirmError(null)
  }

  const handleFile = async (f: File, columnHints?: ColumnHints) => {
    setFile(f)
    setUploading(true)
    setUploadError(null)
    try {
      const { data } = await importsApi.preview(f, columnHints)
      setPreview(data)
      const initMapping: Record<string, AccountMapping> = {}
      for (const acc of data.accounts) {
        const match = data.existing_accounts.find(
          (e) => e.name.toLowerCase() === acc.name.toLowerCase()
        )
        if (match) {
          initMapping[acc.rib] = {
            rib: acc.rib,
            create: false,
            id: match.id,
            name: match.name,
            account_type: match.account_type,
          }
        } else {
          initMapping[acc.rib] = {
            rib: acc.rib,
            create: true,
            name: acc.name,
            account_type: 'checking',
          }
        }
      }
      setMapping(initMapping)
      const txsWithRecurring = Object.fromEntries(
        Object.entries(data.transactions).map(([rib, txs]) => [
          rib,
          txs.map((tx) => ({ ...tx, is_recurring: false })),
        ])
      )
      setTransactions(txsWithRecurring)
      setStep('mapping')
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { error?: string; sheets?: SheetMeta[] } } })?.response
      if (response?.status === 422 && response?.data?.error === 'column_mapping_required') {
        setColumnSheets(response.data.sheets ?? null)
        setStep('columns')
      } else {
        setUploadError("Erreur lors de la lecture du fichier. Vérifiez qu'il s'agit d'un export bancaire valide (.xlsx).")
      }
    } finally {
      setUploading(false)
    }
  }

  const handleColumnsSubmit = (hints: ColumnHints) => {
    if (file) handleFile(file, hints)
  }

  const wizardSteps = (columnSheets !== null
    ? ['upload', 'columns', 'mapping', 'preview']
    : ['upload', 'mapping', 'preview']) as Exclude<Step, 'result'>[]

  const stepLabels = wizardSteps.reduce<Record<string, string>>(
    (acc, s, i) => ({ ...acc, [s]: `${i + 1}. ${STEP_NAMES[s]}` }),
    {},
  )

  const canProceedMapping =
    preview !== null &&
    Object.values(mapping).every((m) => (m.create ? m.name.trim().length > 0 : Boolean(m.id)))

  const handleCategoryChange = (rib: string, index: number, categoryId: number | null) => {
    setTransactions((prev) => {
      const updated = [...(prev[rib] ?? [])]
      updated[index] = { ...updated[index], category_id: categoryId }
      return { ...prev, [rib]: updated }
    })
  }

  const handleRecurringChange = (rib: string, index: number, isRecurring: boolean) => {
    setTransactions((prev) => {
      const updated = [...(prev[rib] ?? [])]
      updated[index] = { ...updated[index], is_recurring: isRecurring }
      return { ...prev, [rib]: updated }
    })
  }

  const handleConfirm = async () => {
    setConfirming(true)
    setConfirmError(null)
    setConfirmResult(null)
    try {
      const { data } = await importsApi.confirm({ mapping, transactions })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmResult(data)
      setStep('result')
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setConfirmError(apiMsg ?? "Une erreur inattendue s'est produite.")
      setStep('result')
    } finally {
      setConfirming(false)
    }
  }

  const handleBack = () => {
    const idx = wizardSteps.indexOf(step as Exclude<Step, 'result'>)
    const prev = idx > 0 ? wizardSteps[idx - 1] : 'upload'
    if (prev === 'upload') {
      setColumnSheets(null)
      setFile(null)
    }
    setStep(prev)
  }

  const isLoading = uploading || confirming

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
            <div>
              <Dialog.Title className="text-base font-semibold text-gray-100">
                Importer un fichier
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Assistant d'importation de relevé bancaire
              </Dialog.Description>
              {step !== 'result' && (
                <div className="flex gap-3 mt-1">
                  {wizardSteps.map((s) => (
                    <span
                      key={s}
                      className={`text-xs ${s === step ? 'text-brand-400 font-medium' : 'text-gray-600'}`}
                    >
                      {stepLabels[s]}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="text-gray-500 hover:text-gray-300 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Progress bar */}
          {isLoading && <ProgressBar />}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <StepUpload onFile={handleFile} loading={uploading} error={uploadError} />
            )}
            {step === 'columns' && columnSheets && (
              <StepColumns sheets={columnSheets} onSubmit={handleColumnsSubmit} loading={uploading} />
            )}
            {step === 'mapping' && preview && (
              <StepMapping
                importedAccounts={preview.accounts}
                existingAccounts={preview.existing_accounts}
                mapping={mapping}
                onChange={setMapping}
              />
            )}
            {step === 'preview' && preview && (
              <StepPreview
                transactions={transactions}
                mapping={mapping}
                duplicateCounts={preview.duplicate_counts}
                categories={categories}
                onChange={handleCategoryChange}
                onRecurringChange={handleRecurringChange}
              />
            )}
            {step === 'result' && (
              <StepResult
                result={confirmResult}
                error={confirmError}
                mapping={mapping}
              />
            )}
          </div>

          {/* Footer */}
          {step !== 'upload' && step !== 'result' && (
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-800 shrink-0">
              <Button variant="secondary" size="sm" onClick={handleBack} disabled={confirming}>
                Retour
              </Button>
              {step === 'mapping' && (
                <Button disabled={!canProceedMapping} onClick={() => setStep('preview')}>
                  Suivant
                </Button>
              )}
              {step === 'preview' && (
                <Button onClick={handleConfirm} loading={confirming}>
                  Importer
                </Button>
              )}
            </div>
          )}
          {step === 'result' && (
            <div className="flex justify-end px-6 py-4 border-t border-gray-800 shrink-0 gap-3">
              {confirmError && (
                <Button variant="secondary" size="sm" onClick={() => setStep('preview')}>
                  Retour
                </Button>
              )}
              <Button onClick={() => { onOpenChange(false); reset() }}>
                Fermer
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface StepResultProps {
  result: ConfirmResponse | null
  error: string | null
  mapping: Record<string, AccountMapping>
}

function StepResult({ result, error, mapping }: StepResultProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <div>
          <p className="text-base font-semibold text-gray-100">Erreur lors de l'importation</p>
          <p className="text-sm text-red-400 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!result) return null

  const accountNames = Object.values(mapping)
    .filter((m) => !m.create)
    .map((m) => m.name)
  const newAccountNames = Object.values(mapping)
    .filter((m) => m.create)
    .map((m) => m.name)

  const allDuplicates = result.created_transactions === 0 && result.created_accounts === 0

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      {allDuplicates ? (
        <Info className="h-12 w-12 text-yellow-400" />
      ) : (
        <CheckCircle2 className="h-12 w-12 text-green-400" />
      )}

      <div className="space-y-1">
        {allDuplicates ? (
          <>
            <p className="text-base font-semibold text-gray-100">Aucune nouvelle transaction</p>
            <p className="text-sm text-gray-400">
              Toutes les transactions de ce fichier sont déjà présentes dans vos comptes.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-gray-100">Import réussi</p>
            <p className="text-sm text-gray-400">
              <span className="text-green-400 font-medium">{result.created_transactions}</span>{' '}
              {result.created_transactions === 1 ? 'transaction importée' : 'transactions importées'}
              {result.created_accounts > 0 && (
                <>
                  {' '}·{' '}
                  <span className="text-brand-400 font-medium">{result.created_accounts}</span>{' '}
                  {result.created_accounts === 1 ? 'compte créé' : 'comptes créés'}
                </>
              )}
            </p>
          </>
        )}
      </div>

      {(accountNames.length > 0 || newAccountNames.length > 0) && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {accountNames.map((n) => (
            <p key={n}>→ {n}</p>
          ))}
          {newAccountNames.map((n) => (
            <p key={n}>→ {n} <span className="text-brand-500">(nouveau)</span></p>
          ))}
        </div>
      )}
    </div>
  )
}
