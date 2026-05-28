import client from './client'
import type { Category, PaginatedResponse } from '@/types'

export const categoriesApi = {
  list: () =>
    client.get<PaginatedResponse<Category>>('/categories/'),
  create: (data: Partial<Category>) =>
    client.post<Category>('/categories/', data),
  update: (id: number, data: Partial<Category>) =>
    client.patch<Category>(`/categories/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/categories/${id}/`),
}
