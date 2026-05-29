import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'

interface Props {
  onFile: (file: File) => void
  loading: boolean
  error: string | null
}

export function StepUpload({ onFile, loading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handle = (file: File | undefined) => {
    if (!file) return
    if (!file.name.endsWith('.xlsx')) return
    onFile(file)
  }

  return (
    <div className="space-y-4">
      <div
        className={clsx(
          'border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors',
          dragging ? 'border-brand-500 bg-brand-500/10' : 'border-gray-700 hover:border-gray-500',
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handle(e.dataTransfer.files[0])
        }}
      >
        <Upload className="h-8 w-8 text-gray-500" />
        <p className="text-sm text-gray-400">Glisser un fichier <span className="font-medium text-gray-200">.xlsx</span> ou cliquer pour sélectionner</p>
        <p className="text-xs text-gray-600">Export Crédit Mutuel uniquement</p>
        <Button size="sm" variant="secondary" type="button" loading={loading}>
          Choisir un fichier
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
