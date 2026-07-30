import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5001',
})

const TOKEN_KEY = 'chaintrack_token'

api.interceptors.request.use((config) => {
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY)
    }
    return Promise.reject(error)
  },
)

export { TOKEN_KEY }
