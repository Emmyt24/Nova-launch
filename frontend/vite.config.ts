import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const isAnalyze = process.env.ANALYZE === 'true'
  const plugins = [react()]

  if (command === 'build') {
    try {
      const { default: compression } = await import('vite-plugin-compression')
      plugins.push(compression({ algorithm: 'gzip' }))
      plugins.push(compression({ algorithm: 'brotliCompress', ext: '.br' }))
    } catch {
      console.warn(
        'vite-plugin-compression is not installed; skipping compression plugins for this build.',
      )
    }
  }

  if (isAnalyze) {
    try {
      const { visualizer } = await import('rollup-plugin-visualizer')
      plugins.push(
        visualizer({
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
          open: true,
        }),
      )
    } catch {
      console.warn(
        'rollup-plugin-visualizer is not installed; skipping bundle analysis plugin.',
      )
    }
  }

  return {
    plugins,
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      reportCompressedSize: true,
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) {
                return 'react'
              }
              return 'vendor'
            }
          },
        },
      },
    },
    esbuild: {
      drop: ['console', 'debugger'],
    },
  }
})
