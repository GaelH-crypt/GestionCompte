import axios from 'axios'
import client from './client'
import type { User } from '@/types'

const BASE_URL = '/api'

export const authApi = {
  login: (username: string, password: string) =>
    client.post<{ access: string; refresh: string }>('/auth/login/', { username, password }),
  logout: (refresh: string) =>
    client.post('/auth/logout/', { refresh }),
  me: () =>
    client.get<User>('/auth/me/'),
  refresh: (refresh: string) =>
    axios.post<{ access: string }>(`${BASE_URL}/auth/refresh/`, { refresh }),
}
