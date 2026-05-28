import client from './client'
import type { Credit, PaginatedResponse, ScheduleRow } from '@/types'

export const creditsApi = {
  list: () =>
    client.get<PaginatedResponse<Credit>>('/credits/'),
  get: (id: number) =>
    client.get<Credit>(`/credits/${id}/`),
  schedule: (id: number, months = 12) =>
    client.get<ScheduleRow[]>(`/credits/${id}/schedule/`, { params: { months } }),
  create: (data: Partial<Credit>) =>
    client.post<Credit>('/credits/', data),
  update: (id: number, data: Partial<Credit>) =>
    client.patch<Credit>(`/credits/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/credits/${id}/`),
}
