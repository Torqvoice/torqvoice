import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  allowedDevOrigins: ['10.0.0.217'],
  experimental: {
    proxyClientMaxBodySize: '2gb',
  },
}

export default nextConfig
