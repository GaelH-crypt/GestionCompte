import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Shared promise so concurrent 401s share one refresh call instead of each
// trying to rotate the same refresh token (which blacklists it after first use).
let refreshPromise: Promise<string> | null = null

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean }
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        if (!refreshPromise) {
          const refreshToken = useAuthStore.getState().refreshToken
          if (!refreshToken) throw new Error('No refresh token')
          refreshPromise = axios
            .post('/api/auth/refresh/', { refresh: refreshToken })
            .then(({ data }) => {
              useAuthStore.getState().setTokens(data.access, data.refresh)
              return data.access as string
            })
            .finally(() => {
              refreshPromise = null
            })
        }
        const newAccessToken = await refreshPromise
        original.headers.Authorization = `Bearer ${newAccessToken}`
        return client(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)

export default client
