const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const API_BASE_URL = (configuredBaseUrl || 'http://localhost:8080').replace(/\/+$/, '')

// Returns a native Response so future features can handle their own API contracts.
// Importing this module does not send any requests.
export function apiClient(path, options = {}) {
  return fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, options)
}
