import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['API_PROXY_TARGET', 'VITE_API_BASE_URL'])
  // Retain old local configurations as a server-only fallback during migration.
  const legacyTarget = /^https?:\/\//.test(env.VITE_API_BASE_URL?.trim() ?? '')
    ? env.VITE_API_BASE_URL.trim()
    : undefined
  const target = (env.API_PROXY_TARGET?.trim() || legacyTarget || 'http://localhost:8080').replace(/\/+$/, '')
  const proxy = {
    '^/api(?:/|$)': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api(?=\/|$)/, '') || '/',
    },
  }

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
