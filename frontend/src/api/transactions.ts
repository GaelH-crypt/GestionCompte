import client from './client'
import type { Transaction, PaginatedResponse, RecurringSuggestion } from '@/types'

export const transactionsApi = {
  list: (params?: Record<string, string | number>) =>
    client.get<PaginatedResponse<Transaction>>('/transactions/', { params }),
  get: (id: number) =>
    client.get<Transaction>(`/transactions/${id}/`),
  create: (data: Partial<Transaction>) =>
    client.post<Transaction>('/transactions/', data),
  update: (id: number, data: Partial<Transaction>) =>
    client.patch<Transaction>(`/transactions/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/transactions/${id}/`),
  detectRecurring: () =>
    client.get<RecurringSuggestion[]>('/transactions/detect-recurring/'),
  linkRecurring: (txId: number, recurringId: number | null) =>
    client.post<Transaction>(`/transactions/${txId}/link-recurring/`, { recurring_id: recurringId }),
}
