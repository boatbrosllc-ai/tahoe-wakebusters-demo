/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
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
    return config;
  },
  // Explicit function; Next.js 14.2 can pass undefined when config is loaded from paths with spaces
  generateBuildId() {
    return process.env.BUILD_ID || 'boatbros-' + Date.now();
  },
};

module.exports = nextConfig;
