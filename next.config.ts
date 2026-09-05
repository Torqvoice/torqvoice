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
      // Every response. Later, more specific entries win on the same key, so
      // the status-report share below still gets its stricter values.
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing off this origin may frame the app; the app frames its own
          // previews and print views, so same-origin stays allowed.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera and microphone are used by our own pages (scanning, photos,
          // recordings); an embedded third-party frame gets neither.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(self)',
          },
        ],
      },
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
