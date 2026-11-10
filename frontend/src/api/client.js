// Browser requests stay on the frontend origin in every build mode.
// Vite or the deployment reverse proxy owns the configurable backend target.
export const API_BASE_URL = '/api'

// Returns a native Response so future features can handle their own API contracts.
// Importing this module does not send any requests.
export function apiClient(path, options = {}) {
  return fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, options)
}
