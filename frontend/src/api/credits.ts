import client from './client'
import type { Credit, CreditDraw, PaginatedResponse, ScheduleRow } from '@/types'

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
  draws: {
    list: (creditId: number) =>
      client.get<CreditDraw[]>(`/credits/${creditId}/draws/`),
    create: (creditId: number, data: Partial<CreditDraw>) =>
      client.post<CreditDraw>(`/credits/${creditId}/draws/`, data),
    update: (creditId: number, drawId: number, data: Partial<CreditDraw>) =>
      client.patch<CreditDraw>(`/credits/${creditId}/draws/${drawId}/`, data),
    delete: (creditId: number, drawId: number) =>
      client.delete(`/credits/${creditId}/draws/${drawId}/`),
  },
}
