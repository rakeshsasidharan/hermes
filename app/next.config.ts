import type { NextConfig } from 'next';

const allowedOrigins = process.env.APP_DOMAIN ? [process.env.APP_DOMAIN] : [];

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
