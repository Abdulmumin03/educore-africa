import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Monorepo: shared secrets (DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY) live in
// the repo-root .env, which Next won't pick up on its own. Console-only vars
// (SUPERADMIN_SECRET, ALLOWED_IPS, NEXT_PUBLIC_APP_URL) live in this app's
// .env.local, which Next loads first and which therefore wins on collisions.
const require = createRequire(import.meta.url)
const { loadEnvConfig } = require("@next/env")

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnvConfig(path.resolve(__dirname, "../.."))

const isProd = process.env.NODE_ENV === "production"

/**
 * Content Security Policy.
 *
 * Two deliberate loosenings, both forced by the framework rather than chosen:
 *
 *   'unsafe-inline' on script-src — Next.js App Router inlines its bootstrap
 *   and flight payload as inline <script> tags. Removing it means adopting a
 *   nonce, which requires every page to be dynamically rendered; this console
 *   is already fully dynamic, but the nonce has to be threaded through the
 *   framework's own tags, which Next 14 does not expose. Revisit on 15.
 *
 *   'unsafe-eval' in development only — React Refresh needs it. Production
 *   does not get it.
 *
 * 'unsafe-inline' on style-src is not going away: React sets element styles
 * inline, and so does most of this codebase.
 *
 * Everything else is closed. No external script, font, frame or connection
 * host is permitted — the console talks to its own origin and nothing else,
 * which is what an internal tool holding cross-tenant data should do.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Same-origin only: no analytics beacon, no third-party error reporter
  // reaching out of the console with tenant data in the payload.
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ")

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@educore/database"],

  // Playwright is require()'d at runtime by lib/report-export, never bundled.
  // Left to webpack it drags in the whole test runner and fails to resolve
  // chromium-bidi, which takes down every route that touches PDF rendering —
  // not just the PDF path.
  experimental: {
    serverComponentsExternalPackages: ["@playwright/test", "playwright", "playwright-core"],
  },
  // Never leak the framework version to an unauthenticated prober.
  poweredByHeader: false,
  eslint: {
    // Lint runs as its own turbo task; don't fail `next build` twice over it.
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Internal console — never let it be framed or indexed.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // Nothing here needs a camera, a microphone or a location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // HSTS only in production: sending it from localhost would pin the
          // developer's browser to HTTPS on a port that does not serve it.
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      {
        // Exports and report downloads carry cross-tenant data; no cache, and
        // no sniffing them into something the browser will render inline.
        source: "/api/(export|reports)/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ]
  },
}

export default nextConfig
