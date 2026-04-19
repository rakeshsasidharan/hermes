import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['hermes.rpillai.dev'],
    },
  },
};

export default nextConfig;
