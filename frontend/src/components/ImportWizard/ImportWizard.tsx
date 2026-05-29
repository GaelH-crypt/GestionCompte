import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { importsApi } from '@/api/imports'
import { StepUpload } from './StepUpload'
import { StepColumns } from './StepColumns'
import { StepMapping } from './StepMapping'
import { StepPreview } from './StepPreview'
import { Button } from '@/components/ui/Button'
import type {
  PreviewResponse, AccountMapping, ImportedTransaction, Category,
  SheetMeta, ColumnHints,
} from '@/types'

type Step = 'upload' | 'columns' | 'mapping' | 'preview'

const STEP_NAMES: Record<Step, string> = {
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

  const reset = () => {
    setStep('upload')
    setFile(null)
    setUploading(false)
    setUploadError(null)
    setColumnSheets(null)
    setPreview(null)
    setMapping({})
    setTransactions({})
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
        initMapping[acc.rib] = {
          rib: acc.rib,
          create: true,
          name: acc.name,
          account_type: 'checking',
        }
      }
      setMapping(initMapping)
      setTransactions(data.transactions)
      setStep('mapping')
    } catch (err: any) {
      if (err?.response?.status === 422 && err?.response?.data?.error === 'column_mapping_required') {
        setColumnSheets(err.response.data.sheets)
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

  const steps: Step[] = columnSheets !== null
    ? ['upload', 'columns', 'mapping', 'preview']
    : ['upload', 'mapping', 'preview']

  const stepLabels = steps.reduce<Record<Step, string>>(
    (acc, s, i) => ({ ...acc, [s]: `${i + 1}. ${STEP_NAMES[s]}` }),
    {} as Record<Step, string>,
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

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await importsApi.confirm({ mapping, transactions })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
      reset()
    } finally {
      setConfirming(false)
    }
  }

  const handleBack = () => {
    const idx = steps.indexOf(step)
    const prev = idx > 0 ? steps[idx - 1] : 'upload'
    if (prev === 'upload') {
      setColumnSheets(null)
      setFile(null)
    }
    setStep(prev)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div>
              <Dialog.Title className="text-base font-semibold text-gray-100">
                Importer un fichier
              </Dialog.Title>
              <div className="flex gap-3 mt-1">
                {steps.map((s) => (
                  <span
                    key={s}
                    className={`text-xs ${s === step ? 'text-brand-400 font-medium' : 'text-gray-600'}`}
                  >
                    {stepLabels[s]}
                  </span>
                ))}
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="text-gray-500 hover:text-gray-300 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

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
              />
            )}
          </div>

          {step !== 'upload' && (
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-800">
              <Button variant="secondary" size="sm" onClick={handleBack}>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
