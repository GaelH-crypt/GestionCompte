import client from './client'
import type { UserPreference } from '@/types'

export const preferencesApi = {
  get: () => client.get<UserPreference>('/preferences/'),
  patch: (data: { primary_account: number | null }) =>
    client.patch<UserPreference>('/preferences/', data),
}
