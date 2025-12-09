/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Optimize chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'stripe-vendor': ['@stripe/stripe-js', '@stripe/react-stripe-js'],
          'query-vendor': ['react-query'],
          'ui-vendor': ['lucide-react'],
          // Admin pages chunk (large, rarely accessed)
          'admin': [
            './src/pages/admin/AdminDashboard',
            './src/pages/admin/AdminSettings',
            './src/pages/admin/AdminDonations',
            './src/pages/admin/AdminContacts',
            './src/pages/admin/AdminEvents',
            './src/pages/admin/AdminStories',
            './src/pages/admin/AdminTestimonials',
            './src/pages/admin/AdminVolunteers',
            './src/pages/admin/AdminSubscriptions',
            './src/pages/admin/AdminPrograms',
            './src/pages/admin/AdminGallery',
            './src/pages/admin/AdminVideos',
            './src/pages/admin/AdminUsers',
            './src/pages/admin/AdminSlideshow',
            './src/pages/admin/AdminUrgentNeeds',
          ],
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable minification with esbuild (faster than terser, built into Vite)
    minify: 'esbuild',
    // Enable source maps for production debugging (optional)
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})