/// <reference types="vite/client" />
import { defineConfig } from 'vite'
// @ts-expect-error - plugin-react types will be available after npm install
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
              return 'react-vendor'
            }
            if (id.includes('@stellar')) {
              return 'stellar-sdk'
            }
            if (id.includes('i18next')) {
              return 'i18n'
            }
            return 'vendor'
          }
          if (id.includes('landing/Features') || 
              id.includes('landing/FAQ') || 
              id.includes('landing/Footer')) {
            return 'landing'
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
