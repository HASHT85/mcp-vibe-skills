import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'VEIST — Autonomous AI System',
        short_name: 'VEIST',
        description: 'Autonomous multi-agent AI system dashboard',
        theme_color: '#D7FF2F',
        background_color: '#0A0A0B',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'New Pipeline',
            url: '/?tab=launch',
            description: 'Launch a new AI pipeline',
          },
          {
            name: 'Docker Projects',
            url: '/?tab=containers',
            description: 'View Docker container projects',
          },
        ],
      },
      workbox: {
        // Cache strategy: network-first for API calls, cache-first for static assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.veist\.hach\.dev\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 min
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
        // Don't cache auth-required pages offline to avoid stale auth state
        navigateFallback: null,
      },
      devOptions: {
        enabled: false, // Disable in dev to avoid SW conflicts
      },
    }),
  ],
})
