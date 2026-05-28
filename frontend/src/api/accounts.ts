import client from './client'
import type { Account, PaginatedResponse } from '@/types'

export const accountsApi = {
  list: () =>
    client.get<PaginatedResponse<Account>>('/accounts/'),
  get: (id: number) =>
    client.get<Account>(`/accounts/${id}/`),
  create: (data: Partial<Account>) =>
    client.post<Account>('/accounts/', data),
  update: (id: number, data: Partial<Account>) =>
    client.patch<Account>(`/accounts/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/accounts/${id}/`),
}
