import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

// Audit F-23 (Beasties critical-CSS extraction) was reverted — see
// PR #193. The plugin's `preload: 'media'` mode emits a deferred
// stylesheet `<link media="print" onload="this.media='all'">` whose
// inline `onload` handler is blocked by our CSP (no script-src
// 'unsafe-inline'). End result on prod: only the inline critical
// subset loaded, the deferred sheet never activated, the SPA rendered
// completely unstyled. Index.html had a comment explicitly warning
// about this trap (re: the font-loading link); we missed it.
//
// To revisit critical-CSS extraction: either relax CSP to allow the
// onload handler (tradeoff documented in SECURITY.md), use a CSP
// nonce-based loader, or pre-emit the swap via a small external JS
// file that gets a hash + nonce in the build.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_TARGET = env.VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [
      react(),

      /* ──────────────────────────────────────────────────────────────────
       * Build-time image optimization
       *
       * Aggressive lossy compression for raster assets (PNG / JPEG / TIFF
       * / GIF) and full multipass SVG opt via SVGO. Only assets that pass
       * through the Vite pipeline are touched — files served straight out
       * of `/public` are NOT processed, so any image we want optimised
       * must be `import`-ed from JS or referenced from CSS.
       *
       * The named plugin compresses in-place rather than converting
       * formats, so to actually deliver `.webp` to the browser we ship a
       * sibling `.webp` asset and reference it via <picture>/srcset (see
       * the Brand mark in components/LiquidGlassNav.jsx).
       * ────────────────────────────────────────────────────────────── */
      ViteImageOptimizer({
        test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
        png:  { quality: 75 },
        jpeg: { quality: 75 },
        jpg:  { quality: 75 },
        tiff: { quality: 75 },
        webp: { quality: 80 },
        avif: { quality: 70 },
        svg: {
          multipass: true,
          plugins: [
            {
              name: 'preset-default',
              params: { overrides: { cleanupNumericValues: false, removeViewBox: false } },
            },
            'sortAttrs',
            { name: 'addAttributesToSVGElement', params: { attributes: [{ xmlns: 'http://www.w3.org/2000/svg' }] } },
          ],
        },
      }),

    ],
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
      rollupOptions: {
        output: {
          /* ────────────────────────────────────────────────────────────────
           * Per-package vendor chunk splitting
           *
           * Every distinct top-level npm package gets its own chunk
           * (`vendor-react`, `vendor-lucide-react`, `vendor-recharts`, …).
           * This:
           *   • lets browsers leverage HTTP cache across releases — when
           *     only your app code changes, every untouched vendor chunk
           *     hits a 304;
           *   • shrinks the parser payload of any single chunk so the
           *     main thread isn't blocked decoding one giant blob.
           *
           * NOTE on the snippet supplied in the brief
           *   `id.toString().split('node_modules/').split('/').toString()`
           * — that throws at build time, because `.split('/')` is being
           * called on the Array result of the previous `.split()`. The
           * corrected logic below extracts the first path segment after
           * `node_modules/` and names the chunk after it (with proper
           * handling for `@scope/name` packages).
           * ──────────────────────────────────────────────────────────── */
          manualChunks(id) {
            if (id.includes('node_modules')) {
              const after = id.toString().split('node_modules/')[1] || ''
              const segments = after.split('/')
              const pkg = segments[0]?.startsWith('@')
                ? `${segments[0]}/${segments[1] || ''}`
                : segments[0]
              return pkg
                ? `vendor-${pkg.replace('@', '').replace('/', '-')}`
                : undefined
            }
          },
        },
      },
      cssMinify: true,
      // esbuild is Vite's built-in minifier — no extra dependency needed
      minify: 'esbuild',
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
  }
})
