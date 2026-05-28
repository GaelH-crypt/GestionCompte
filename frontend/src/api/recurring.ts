import client from './client'
import type { RecurringTransaction, PaginatedResponse } from '@/types'

export const recurringApi = {
  list: () =>
    client.get<PaginatedResponse<RecurringTransaction>>('/recurring/'),
  create: (data: Partial<RecurringTransaction>) =>
    client.post<RecurringTransaction>('/recurring/', data),
  update: (id: number, data: Partial<RecurringTransaction>) =>
    client.patch<RecurringTransaction>(`/recurring/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/recurring/${id}/`),
}
