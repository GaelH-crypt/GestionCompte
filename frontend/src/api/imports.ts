import client from './client'
import type { PreviewResponse, ConfirmPayload, ConfirmResponse } from '@/types'

export const importsApi = {
  preview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.post<PreviewResponse>('/import/preview/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  confirm: (payload: ConfirmPayload) =>
    client.post<ConfirmResponse>('/import/confirm/', payload),
}
