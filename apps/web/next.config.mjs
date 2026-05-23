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

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default nextConfig
