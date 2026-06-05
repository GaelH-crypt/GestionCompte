import client from './client'
import type { ProjectionPoint, SimulationParams } from '@/types'

export const projectionsApi = {
  project: (months: number, daily = false) =>
    client.get<ProjectionPoint[]>('/projections/', { params: { months, daily } }),
  simulate: (params: SimulationParams) =>
    client.post<ProjectionPoint[]>('/projections/simulate/', params),
}
