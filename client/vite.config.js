import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // In development, proxy /api to the local Express server so the browser
  // never has to deal with CORS at all.  The proxy rewrites /api/... → /api/...
  // (no strip) because Express mounts routes under /api.
  const API_TARGET = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          // Do NOT rewrite — keep /api prefix so Express routes match
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
