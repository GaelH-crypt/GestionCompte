import client from './client'
import type { UserPreference } from '@/types'

export const preferencesApi = {
  get: () => client.get<UserPreference>('/preferences/'),
  patch: (data: { primary_account?: number | null; cycle_start_day?: number }) =>
    client.patch<UserPreference>('/preferences/', data),
}
