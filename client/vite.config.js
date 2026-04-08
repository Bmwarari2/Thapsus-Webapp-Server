import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_TARGET = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Hidden source maps: available for debugging tools but not exposed in browser
      sourcemap: 'hidden',
      chunkSizeWarningLimit: 500,
      // Optimised code splitting
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor: core React + router in their own cacheable chunk
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // UI libs: icons + toaster in a separate chunk
            'vendor-ui': ['lucide-react', 'react-hot-toast'],
            // Charting (only loaded by dashboard/admin pages)
            'vendor-charts': ['recharts'],
          },
        },
      },
      // Reduce CSS size
      cssMinify: true,
      // Better minification
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: true,
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
  }
})
