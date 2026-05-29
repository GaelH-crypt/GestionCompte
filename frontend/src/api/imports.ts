import client from './client'
import type { PreviewResponse, ConfirmPayload, ConfirmResponse, ColumnHints } from '@/types'

export const importsApi = {
  preview: (file: File, columnHints?: ColumnHints) => {
    const form = new FormData()
    form.append('file', file)
    if (columnHints) form.append('column_hints', JSON.stringify(columnHints))
    return client.post<PreviewResponse>('/import/preview/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  confirm: (payload: ConfirmPayload) =>
    client.post<ConfirmResponse>('/import/confirm/', payload),
}
