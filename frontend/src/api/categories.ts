import client from './client'
import type { Category, CategoryRule, PaginatedResponse } from '@/types'

export const categoriesApi = {
  list: () =>
    client.get<PaginatedResponse<Category>>('/categories/'),
  create: (data: Partial<Category>) =>
    client.post<Category>('/categories/', data),
  update: (id: number, data: Partial<Category>) =>
    client.patch<Category>(`/categories/${id}/`, data),
  delete: (id: number) =>
    client.delete(`/categories/${id}/`),

  rules: {
    list: () =>
      client.get<CategoryRule[]>('/categories/rules/'),
    create: (data: { pattern: string; match_type: string; category: number; order?: number }) =>
      client.post<CategoryRule>('/categories/rules/', data),
    delete: (id: number) =>
      client.delete(`/categories/rules/${id}/`),
    apply: () =>
      client.post<{ applied: number }>('/categories/rules/apply/'),
  },
}
