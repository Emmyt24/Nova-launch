import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(() => {
  const isAnalyze = process.env.ANALYZE === 'true'
  const plugins = [
    react(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
  ]

  if (isAnalyze) {
    plugins.push(
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        open: true,
      }),
    )
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
