import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Reuse the same API handlers used by Vercel production.
import rssFetch from './api/rss-fetch.js'
import ogImage from './api/og-image.js'
import aiSummary from './api/ai-summary.js'

// Connect middleware does not need to mount these handlers on a
// sub-path. This preserves the original req.url for the API handlers.

function apiRelay(path, handler) {
  const handle = (req, res, next) => {
    let pathname

    try {
      pathname = new URL(
        req.url || '/',
        'http://localhost',
      ).pathname
    } catch {
      return next()
    }

    if (pathname !== path) {
      return next()
    }

    // Vercel response API compatibility for Vite
    if (typeof res.status !== 'function') {
      res.status = function (code) {
        this.statusCode = code
        return this
      }
    }

       if (typeof res.send !== 'function') {
      res.send = function (body) {
        if (body === undefined || body === null) {
          this.end()
          return this
        }

        if (
          typeof body === 'object' &&
          !ArrayBuffer.isView(body)
        ) {
          if (!this.hasHeader('Content-Type')) {
            this.setHeader(
              'Content-Type',
              'application/json; charset=utf-8',
            )
          }

          this.end(JSON.stringify(body))
          return this
        }

        this.end(body)
        return this
      }
    }

    if (typeof res.json !== 'function') {
      res.json = function (body) {
        if (!this.hasHeader('Content-Type')) {
          this.setHeader('Content-Type', 'application/json; charset=utf-8')
        }

        this.end(JSON.stringify(body))
        return this
      }
    }

    /* Vercel parses JSON request bodies before its functions run; the Vite
       middleware must do the same, or POST handlers would see req.body
       undefined. */
    const prepareBody = async (victim) => {
      if (victim.method === 'GET' || victim.method === 'HEAD') return;
      if (victim.body !== undefined) return;

      const chunks = [];
      for await (const chunk of victim) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');

      if (!raw) return;

      const contentType = victim.headers?.['content-type'] || '';

      if (/application\/json/i.test(contentType)) {
        try { victim.body = JSON.parse(raw); } catch { victim.body = raw; }
      } else {
        victim.body = raw;
      }
    };

    Promise.resolve(prepareBody(req)).then(() => handler(req, res)).catch(next)
  }

  return {
    name: `${path.slice(1)}-relay`,

    configureServer(server) {
      server.middlewares.use(handle)
    },

    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}


export default defineConfig(({ mode }) => {
  /* The /api/ai-summary relay reads GROQ_API_KEY / GEMINI_API_KEY the same
     way the Vercel function does — from the environment. In dev and preview
     those come from .env (any prefix), exactly as production takes them
     from Vercel's Environment Variables. */
  const env = loadEnv(mode, process.cwd(), '');

  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY;
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

  return {
    plugins: [
      react(),
      tailwindcss(),

      // Same RSS, OG image and AI summary security logic in dev, preview
      // and production.
      apiRelay('/rss-fetch', rssFetch),
      apiRelay('/og-image', ogImage),
      apiRelay('/api/ai-summary', aiSummary),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'favicon.svg',
        'pwa-192.png',
        'pwa-512.png',
      ],

      workbox: {
        // The paper itself opens offline.
        navigateFallback: 'index.html',

        runtimeCaching: [
          {
            // RSS relay: fresh when online, last edition when offline.
            urlPattern: /\/rss-fetch\?url=/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rss-relay',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 600,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // RSS2JSON API.
            urlPattern: /^https:\/\/api\.rss2json\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rss2json-api',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 300,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // GNews API.
            urlPattern: /^https:\/\/gnews\.io\/api\/v4\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gnews-api',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 300,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Article images resolved by the OG image relay.
            urlPattern: /\/og-image\?url=/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'og-image-relay',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 6 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Google Fonts.
            urlPattern: /^https:\/\/fonts\.(?:gstatic|apis)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            // News photography.
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|webp|gif|svg)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'article-images',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },

      manifest: {
        name: 'The Daily - AI News Platform',
        short_name: 'The Daily',
        description:
          'AI News Discovery Platform with AI-powered article summaries',
        theme_color: '#161513',
        background_color: '#f7f4ee',
        display: 'standalone',

        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
    ],
  }
})
