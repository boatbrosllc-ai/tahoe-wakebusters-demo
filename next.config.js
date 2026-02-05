/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  generateBuildId: () => process.env.BUILD_ID || `build-${Date.now()}`,
};

module.exports = nextConfig;
