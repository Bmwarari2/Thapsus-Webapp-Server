import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import Beasties from 'beasties'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Critical CSS extraction (audit F-23 / PageSpeed "Render blocking requests").
 *
 * The 20 KiB index-*.css file blocks first paint for ~470ms on Slow-4G.
 * Beasties (the maintained successor to Critters / Google Web SDK) inlines
 * the above-the-fold subset of that CSS into <head> at build time and
 * marks the rest as `media="print"` + `onload="this.media='all'"` so the
 * remaining styles fetch off the critical path.
 *
 * Runs in `writeBundle` (post-write) rather than `transformIndexHtml`
 * because Beasties needs to read the built CSS file from disk to extract
 * the critical subset — `transformIndexHtml` fires before assets are
 * flushed to dist/.
 */
function beastiesPlugin() {
  let outDir = 'dist'
  return {
    name: 'beasties-critical-css',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir || 'dist'
    },
    async writeBundle() {
      const indexPath = path.resolve(outDir, 'index.html')
      let html
      try {
        html = await readFile(indexPath, 'utf-8')
      } catch (err) {
        console.warn('[beasties] dist/index.html not found, skipping:', err.message)
        return
      }
      const beasties = new Beasties({
        path: path.resolve(outDir),
        publicPath: '/',
        // `media` mode: non-critical CSS stays as a
        // <link rel="stylesheet" media="print" onload="this.media='all'">
        // so JS-disabled clients still get full styles via the
        // <noscript> fallback Beasties auto-emits.
        preload: 'media',
        pruneSource: false,
        inlineFonts: false,
        compress: true,
        logLevel: 'silent',
      })
      try {
        const transformed = await beasties.process(html)
        await writeFile(indexPath, transformed, 'utf-8')
      } catch (err) {
        // Don't fail the build if extraction trips on something — leaving
        // the original HTML in place is graceful degradation.
        console.warn('[beasties] critical-css extraction failed, leaving HTML unchanged:', err.message)
      }
    },
  }
}

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

      // Run Beasties LAST so it sees Vite's injected <link> tags for the
      // built CSS bundle — see top of this file for the full explanation.
      beastiesPlugin(),
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
