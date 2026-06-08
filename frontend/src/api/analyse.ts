import client from './client'
import type { RapportParams, RapportResponse } from '@/types'

export const analyseApi = {
  rapport: (params: RapportParams) =>
    client.get<RapportResponse>('/analyse/rapport/', { params }),
}
