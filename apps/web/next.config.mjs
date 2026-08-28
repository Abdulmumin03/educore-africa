import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Monorepo: our .env lives at the repo root, not in apps/web. Next.js only
// auto-loads .env files from the app directory, so we have to load the root
// one ourselves before Next reads process.env (DATABASE_URL, NEXTAUTH_SECRET,
// REDIS_URL, etc). This needs to run BEFORE the config object is exported.
//
// @next/env is shipped as CommonJS, so we go through createRequire to avoid
// ESM named-import interop issues ("loadEnvConfig not found in @next/env").
const require = createRequire(import.meta.url)
const { loadEnvConfig } = require("@next/env")

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../..")
loadEnvConfig(repoRoot)

const withPWA = require("next-pwa")({
  dest: "public",
  // Disable the service worker in development so HMR keeps working.
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      // App pages — NetworkFirst so logged-in users always see fresh data
      // when online but fall back to last-known when offline.
      urlPattern: ({ request, url }) =>
        request.mode === "navigate" && !url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "educore-pages",
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
        networkTimeoutSeconds: 5,
      },
    },
    {
      // API responses — NetworkFirst per spec
      urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "educore-api",
        expiration: { maxEntries: 200, maxAgeSeconds: 10 * 60 },
        networkTimeoutSeconds: 8,
      },
    },
    {
      // Static assets (JS/CSS chunks)
      urlPattern: /\/_next\/static\/.*/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "educore-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      // Images
      urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif|ico)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "educore-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      // OpenStreetMap tiles for the live transport map
      urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\//,
      handler: "CacheFirst",
      options: {
        cacheName: "osm-tiles",
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // isomorphic-dompurify pulls in jsdom, which reads its own
    // browser/default-stylesheet.css off disk relative to __dirname. Bundled,
    // that path resolves to apps/web/browser/... and `next build` dies while
    // collecting page data — not only for the routes that sanitise HTML, but
    // for the whole build. require()'d at runtime instead, it finds its file.
    serverComponentsExternalPackages: ["isomorphic-dompurify", "jsdom"],
  },
}

const { withSentryConfig } = require("@sentry/nextjs")

// Sentry source-map upload only runs when SENTRY_AUTH_TOKEN is present —
// dev builds and CI without the secret skip upload (dryRun) instead of
// erroring. Wire the DSN via env (SENTRY_DSN server-side,
// NEXT_PUBLIC_SENTRY_DSN client-side) — see sentry.*.config.ts.
const sentryWebpackOpts = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
}

const sentryNextOpts = {
  hideSourceMaps: true,
  disableLogger: true,
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
}

export default withSentryConfig(
  withPWA(nextConfig),
  sentryWebpackOpts,
  sentryNextOpts,
)
