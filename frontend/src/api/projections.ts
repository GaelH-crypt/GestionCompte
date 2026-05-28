import client from './client'
import type { ProjectionPoint, SimulationParams } from '@/types'

export const projectionsApi = {
  project: (months: number) =>
    client.get<ProjectionPoint[]>('/projections/', { params: { months } }),
  simulate: (params: SimulationParams) =>
    client.post<ProjectionPoint[]>('/projections/simulate/', params),
}
