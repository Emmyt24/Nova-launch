/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@pinata/sdk'],
  },
};

module.exports = nextConfig;
