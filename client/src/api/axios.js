import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // sends the HttpOnly session cookie
  headers: {
    'Content-Type': 'application/json',
  },
})

// These endpoints are expected to return 401 (no session yet, wrong
// password), so they must not trigger the global "session expired" handling.
const AUTH_URLS = ['/auth/login', '/auth/me']

// A 401 from any other call means the session is no longer valid
// (expired, logged out, deactivated). AuthContext listens for this event
// and clears its state, which sends the user to the login page.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isAuthCall = AUTH_URLS.some((authUrl) => url.includes(authUrl))

    if (error.response?.status === 401 && !isAuthCall) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export default apiClient
