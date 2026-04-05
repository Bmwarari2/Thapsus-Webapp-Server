import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Single-service Railway deployment (frontend served by Express):
  //   → Do NOT set VITE_API_URL. The client will use relative '/api' paths,
  //     which Express handles natively. No CORS issues.
  //
  // Split-service Railway deployment (frontend + backend on separate services):
  //   → Set VITE_API_URL=https://your-backend.up.railway.app in Railway
  //     Variables on the FRONTEND service, then redeploy.
  //     This env var must be present at BUILD TIME (not just runtime).
  //
  // Local development:
  //   → The proxy below forwards /api → localhost:5000 automatically.
  const API_TARGET = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          // Do NOT strip /api prefix — Express mounts all routes under /api
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Warn when chunks exceed 1MB
      chunkSizeWarningLimit: 1000,
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
  }
})
