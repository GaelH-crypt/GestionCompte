import client from './client'
import type { DashboardSummary, BalanceHistoryItem } from '@/types'

export const dashboardApi = {
  summary: () =>
    client.get<DashboardSummary>('/dashboard/summary/'),
  history: () =>
    client.get<BalanceHistoryItem[]>('/dashboard/history/'),
}
