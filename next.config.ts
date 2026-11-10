/** Portable Next.js configuration; deployment providers are optional. */
import type { NextConfig } from 'next'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import docsJson from './docs.json' assert { type: 'json' }

// Cloudflare is an optional deployment profile. Resolve it separately from
// evaluation so an absent provider is allowed while a broken installation or
// provider initialization error still fails visibly.
const requireFromConfig = createRequire(resolve('package.json'))
async function initializeOptionalCloudflare(): Promise<void> {
  let entrypoint: string
  try { entrypoint = requireFromConfig.resolve('@opennextjs/cloudflare') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return
    throw error
  }
  const provider = requireFromConfig(entrypoint)
  await provider.initOpenNextCloudflareForDev()
}

interface DocsRedirect {
  source: string
  destination: string
  permanent?: boolean
}

const docRedirects: Array<DocsRedirect> =
  (docsJson as { redirects?: Array<DocsRedirect> }).redirects ?? []

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(self), microphone=(), payment=(), usb=()' },
]

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx'],
  // Generated projects are commonly inspected through a loopback URL. Permit
  // that origin so Next dev can load the RSC payloads required for navigation.
  allowedDevOrigins: ['127.0.0.1'],
  // The engine core is a workspace package shipped as TS-built ESM; let Next
  // transpile it so app routes and (server) components can import it directly.
  // OpenNext cannot load arbitrary Node externals inside workerd. Transpiling
  // these packages lets its final bundle select libSQL's `workerd` export and
  // include the MDX compiler used by dynamic documentation routes.
  transpilePackages: ['@thallylabs/core', '@libsql/client', 'next-mdx-remote', 'shiki'],
  // Several agent surfaces intentionally read customer-owned source/config at
  // runtime. Include those files in the server trace so workerd's read-only fs
  // contains the same project inputs as a Node deployment.
  outputFileTracingIncludes: {
    '/*': ['./AGENTS.md', './docs.json', './openapi.yaml', './public/**/*', './src/content/**/*'],
  },
  experimental: {
    externalDir: true,
    // Persist Turbopack's compiler cache under .next/cache so warm builds —
    // local rebuilds, CI with cache restore, and Thally-managed deploys that
    // restore .next/cache between publishes — skip recompiling unchanged
    // modules. Still marked experimental for production builds by Next, so
    // THALLY_DISABLE_BUILD_CACHE=1 opts out without editing this file.
    turbopackFileSystemCacheForBuild:
      process.env.THALLY_DISABLE_BUILD_CACHE !== '1',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  async redirects() {
    return [
      // Legacy pre-rebrand URL — Track is now documented in the AI features guide.
      { source: '/guides/dox-track', destination: '/guides/ai-features', permanent: true },
      ...docRedirects.map(({ source, destination, permanent = false }) => ({
        source,
        destination,
        permanent,
      })),
    ]
  },
  // Serve the dynamic brand favicon (admin upload → else the Thally default mark)
  // for the browser's automatic /favicon.ico request. We deleted the static
  // app/favicon.ico so Next's default icon can never win; this rewrite makes
  // sure a direct /favicon.ico hit still resolves to the right icon.
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/api/brand/favicon' },
      // Agent-discovery documents. Served by a route handler (not static
      // files) so every deployment emits absolute URLs for its own origin.
      { source: '/.well-known/api-catalog', destination: '/api/well-known/api-catalog' },
      { source: '/.well-known/mcp.json', destination: '/api/well-known/mcp-server-card' },
      { source: '/.well-known/mcp/server-card.json', destination: '/api/well-known/mcp-server-card' },
      { source: '/.well-known/agent-card.json', destination: '/api/well-known/agent-card' },
      { source: '/.well-known/oauth-protected-resource', destination: '/api/well-known/oauth-protected-resource' },
      { source: '/.well-known/agent-skills/index.json', destination: '/api/well-known/agent-skills-index' },
      { source: '/.well-known/agent-skills/:file', destination: '/api/well-known/agent-skills-file/:file' },
      { source: '/auth.md', destination: '/api/well-known/auth-md' },
    ]
  },
}

/** Enable local provider bindings only for a development server with that profile. */
export default async function configureNext(phase: string): Promise<NextConfig> {
  if (phase === 'phase-development-server') await initializeOptionalCloudflare()
  return nextConfig
}
