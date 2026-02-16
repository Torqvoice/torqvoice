import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  allowedDevOrigins: ['10.0.0.217', '192.168.30.111'],
  experimental: {
    proxyClientMaxBodySize: '2gb',
  },
}

export default nextConfig
