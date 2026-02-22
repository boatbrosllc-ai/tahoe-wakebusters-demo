const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Avoid "generate is not a function" when config.generateBuildId is undefined (Next 14.x)
  generateBuildId: async () => null,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: '*.appspot.com' },
      { protocol: 'https', hostname: '*.firebasestorage.app' },
    ],
  },
  // Don't bundle firebase-admin; use Node require at runtime (server-only)
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
  // Force firebase-admin to be external in server bundle (Route Handlers)
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      config.externals.push('firebase-admin');
    }
    // Resolve missing next-response export (Next 14.2 API route bundling)
    if (!config.resolve) config.resolve = {};
    if (!config.resolve.alias) config.resolve.alias = {};
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
