import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png', 'logo-192x192.png', 'logo-512x512.png'],
      srcDir: 'src',
      filename: 'sw.js',
      devOptions: {
        // Disabled on purpose: a dev service worker kept serving a stale
        // bundle after code changes, so live edits never showed up in the
        // browser. Production builds still get the PWA via workbox above.
        enabled: false,
        type: 'module',
      },
      manifest: {
        name: 'Tindahan ni Isko',
        short_name: 'Tindahan',
        description: 'Wear the pride, carry the identity, and support the Iskolar ng Bayan',
        theme_color: '#F97316',
        background_color: '#FFFFFF',
        display: 'standalone',
        /* Tablets and landscape phones must not be locked to portrait. */
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/logo-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/logo-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // PERF-02: page loads go to the network first (3 s budget) and only
        // fall back to the cached shell when offline. Serving the precached
        // index.html first meant a refresh kept showing the old build.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20 },
            },
          },
        ],
      },
    }),
  ],
})
