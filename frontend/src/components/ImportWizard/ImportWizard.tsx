import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { importsApi } from '@/api/imports'
import { StepUpload } from './StepUpload'
import { StepMapping } from './StepMapping'
import { StepPreview } from './StepPreview'
import { Button } from '@/components/ui/Button'
import type {
  PreviewResponse, AccountMapping, ImportedTransaction, Category,
} from '@/types'

type Step = 'upload' | 'mapping' | 'preview'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: Category[]
}

const STEP_LABELS: Record<Step, string> = {
  upload: '1. Fichier',
  mapping: '2. Comptes',
  preview: '3. Confirmation',
}

export function ImportWizard({ open, onOpenChange, categories }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, AccountMapping>>({})
  const [transactions, setTransactions] = useState<Record<string, ImportedTransaction[]>>({})
  const [confirming, setConfirming] = useState(false)

  const reset = () => {
    setStep('upload')
    setUploading(false)
    setUploadError(null)
    setPreview(null)
    setMapping({})
    setTransactions({})
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const { data } = await importsApi.preview(file)
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
      const txsWithRecurring = Object.fromEntries(
        Object.entries(data.transactions).map(([rib, txs]) => [
          rib,
          txs.map((tx) => ({ ...tx, is_recurring: false })),
        ])
      )
      setTransactions(txsWithRecurring)
      setStep('mapping')
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setUploadError(apiMsg ?? "Erreur lors de la lecture du fichier. Vérifiez qu'il s'agit d'un export Crédit Mutuel.")
    } finally {
      setUploading(false)
    }
  }

  const canProceedMapping = preview !== null && Object.values(mapping).every(
    (m) => m.create ? m.name.trim().length > 0 : Boolean(m.id)
  )

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

  const steps: Step[] = ['upload', 'mapping', 'preview']

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div>
              <Dialog.Title className="text-base font-semibold text-gray-100">
                Importer un fichier
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Assistant d'importation de relevé bancaire Crédit Mutuel
              </Dialog.Description>
              <div className="flex gap-3 mt-1">
                {steps.map((s) => (
                  <span
                    key={s}
                    className={`text-xs ${s === step ? 'text-brand-400 font-medium' : 'text-gray-600'}`}
                  >
                    {STEP_LABELS[s]}
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <StepUpload onFile={handleFile} loading={uploading} error={uploadError} />
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
          </div>

          {/* Footer */}
          {step !== 'upload' && (
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep(step === 'preview' ? 'mapping' : 'upload')}
              >
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
