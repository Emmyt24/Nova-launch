/// <reference types="vite/client" />
import { defineConfig } from 'vite'
// @ts-expect-error - plugin-react types will be available after npm install
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * Vite Configuration with Performance Optimizations
 * This config includes all performance best practices
 */
export default defineConfig({
  plugins: [
    react(),
    // Gzip compression
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Brotli compression
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
    // Bundle analyzer (only when ANALYZE=true)
    process.env.ANALYZE === 'true' && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: true,
    assetsInlineLimit: 4096, // Inline assets < 4KB
    
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('node_modules')) {
            // React core
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // Stellar SDK
            if (id.includes('@stellar')) {
              return 'stellar-sdk';
            }
            // i18n
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'i18n';
            }
            // Charts
            if (id.includes('recharts')) {
              return 'charts';
            }
            // Other vendors
            return 'vendor';
          }
          
          // Landing page chunks (lazy loaded)
          if (id.includes('landing/Features') || 
              id.includes('landing/FAQ') || 
              id.includes('landing/Footer')) {
            return 'landing';
          }
          
          // Dashboard chunks (lazy loaded)
          if (id.includes('pages/Dashboard') || 
              id.includes('pages/Leaderboard')) {
            return 'dashboard';
          }
        },
        
        // Optimize chunk file names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false, // Remove comments
      },
    },
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
    ],
    exclude: [
      // Exclude large dependencies that should be lazy loaded
    ],
  },
  
  // Server configuration for development
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  
  // Preview configuration
  preview: {
    port: 4173,
    strictPort: true,
    host: true,
  },
})
