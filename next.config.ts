import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  allowedDevOrigins: ['10.0.0.217', '192.168.30.111'],
  experimental: {
    proxyClientMaxBodySize: '2gb',
  },
  async headers() {
    return [
      {
        source: '/share/status-report/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      // Old /api/files/ URLs stored in the DB before the protected/ restructure
      {
        source: '/api/files/:path*',
        destination: '/api/protected/files/:path*',
      },
    ]
  },
}

export default withNextIntl(nextConfig)
