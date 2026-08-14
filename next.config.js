const path = require('path');
const fs = require('fs');

function readEnvLocal(name) {
  if (process.env[name]?.trim()) return process.env[name].trim();
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
    const match = raw.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : undefined;
  } catch {
    return undefined;
  }
}

/** Dev/build-time customer site. Domain-based routing is not implemented yet. */
const slipstackSiteId =
  readEnvLocal('NEXT_PUBLIC_SLIPSTACK_SITE_ID') ||
  readEnvLocal('SLIPSTACK_SITE_ID') ||
  readEnvLocal('SITE_ID') ||
  'platform-dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SLIPSTACK_SITE_ID: slipstackSiteId,
    NEXT_PUBLIC_SLIPSTACK_SITE_ID: slipstackSiteId,
  },
  /** Dev-only: StrictMode double-mount + HMR can trigger Suspense/webpack "moduleId is not a function". Keep strict in prod builds. */
  /** Avoid `app/(site)/loading.tsx` at the segment root — nested Suspense + streaming + HMR commonly throws `updateDehydratedSuspenseComponent` / `__webpack_modules__[moduleId] is not a function` in dev. Use route-level loading.tsx only where needed. */
  reactStrictMode: process.env.NODE_ENV !== 'development',
  // Ensure a valid unique build ID for asset versioning (env BUILD_ID or timestamp).
  generateBuildId: async () => process.env.BUILD_ID?.trim() || String(Date.now()),
  // Security headers for all routes (payment site). See https://docs.stripe.com/security/guide for CSP.
  // Content-Security-Policy is set only in middleware.ts — do not add it here or in netlify.toml.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
  redirects: async () => [
    // Avoid GSC "Sitemap is HTML" when the sitemap URL is guessed without `.xml` (404 page is HTML).
    { source: "/sitemap", destination: "/sitemap.xml", permanent: true },
    { source: "/more", destination: "/menu", permanent: true },
  ],
  rewrites: async () => [
    {
      source: "/favicon.ico",
      destination: slipstackSiteId === "abc-boats" ? "/sites/abc-boats/logo.svg" : "/brand/logo.svg",
    },
  ],
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      // Legacy / prior-customer Firebase hosts may still serve historical uploaded media.
      // Add the current customer's FIREBASE_STORAGE_BUCKET host when onboarding.
      { protocol: 'https', hostname: 'boat-bros-app.appspot.com' },
      { protocol: 'https', hostname: 'boat-bros-app.firebasestorage.app' },
      { protocol: 'https', hostname: 'nasty-sport-fishing.appspot.com' },
      { protocol: 'https', hostname: 'nasty-sport-fishing.firebasestorage.app' },
      { protocol: 'https', hostname: 'slipstack-platform-dev.appspot.com' },
      { protocol: 'https', hostname: 'slipstack-platform-dev.firebasestorage.app' },
      { protocol: 'https', hostname: 'nastysportfishing.com' },
      { protocol: 'https', hostname: 'www.nastysportfishing.com' },
    ],
  },
  // Don't bundle firebase-admin; use Node require at runtime (server-only)
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
    // Reduce ChunkLoadError (timeout) on dev: allow slower chunk compilation on first load
    webpackBuildWorker: false,
  },
  // Force firebase-admin to be external in server bundle (Route Handlers)
  webpack: (config, { isServer, dev }) => {
    if (isServer && Array.isArray(config.externals)) {
      config.externals.push('firebase-admin');
    }
    // Dev: write chunks to disk to reduce ChunkLoadError (timeout) on Windows / paths with spaces
    if (dev && config.devServer) {
      config.devServer.devMiddleware = config.devServer.devMiddleware || {};
      config.devServer.devMiddleware.writeToDisk = true;
    }
    // Resolve missing next-response export (Next 14.2 API route bundling)
    if (!config.resolve) config.resolve = {};
    if (!config.resolve.alias) config.resolve.alias = {};
    // canvas-confetti's package "module" points at dist/confetti.module.mjs; webpack can emit a
    // mis-served async chunk in dev (404 → ChunkLoadError). Use the browser CJS bundle instead.
    config.resolve.alias["canvas-confetti"] = path.join(
      __dirname,
      "node_modules",
      "canvas-confetti",
      "dist",
      "confetti.browser.js"
    );
    try {
      const responsePath = require.resolve('next/dist/server/web/spec-extension/response.js');
      config.resolve.alias['next/dist/server/web/exports/next-response'] = responsePath;
      config.resolve.alias['next/dist/server/web/exports/next-response.js'] = responsePath;
    } catch (_) {
      const fallback = path.join(__dirname, 'node_modules', 'next', 'dist', 'server', 'web', 'spec-extension', 'response.js');
      config.resolve.alias['next/dist/server/web/exports/next-response'] = fallback;
      config.resolve.alias['next/dist/server/web/exports/next-response.js'] = fallback;
    }
    return config;
  },
};

module.exports = nextConfig;
