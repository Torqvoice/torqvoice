'use client'

import { useEffect, useState } from 'react'
import { reportError } from '@/lib/analytics'
import { isNetworkError } from '@/lib/network-error'

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string }
  reset?: () => void
  /** Next's reset that also fetches the page from the server again. */
  retry?: () => void
}) {
  const lostConnection = isNetworkError(error)

  useEffect(() => {
    // A dropped connection is the network, not a crash: nothing to report
    if (lostConnection) {
      console.warn(error)
      return
    }
    console.error(error)
    // Sent only if PostHog started before the root layout broke
    reportError(error, { error_page: 'root', digest: error.digest ?? null })
  }, [error, lostConnection])

  if (lostConnection) {
    return <ConnectionLost onRetry={retry ?? reset ?? (() => window.location.reload())} />
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: '#09090b',
          color: '#fafafa',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            maxWidth: 420,
            padding: 32,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 16 }}
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: 48,
              fontWeight: 'bold',
              color: '#dc2626',
              margin: '0 0 8px',
              letterSpacing: '-0.05em',
            }}
          >
            500
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Critical Error</h1>
          <p style={{ fontSize: 14, color: '#a1a1aa', margin: '0 0 32px' }}>
            The application encountered a fatal error. Please try refreshing the page.
          </p>
          <button
            // A full reload: the root layout itself broke, and reset() would
            // only draw it again from the same state
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fafafa',
              background: '#dc2626',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}

/** The themes in src/lib/themes.ts that are light, as the root layout maps them. */
const LIGHT_THEMES = ['light', 'graphite', 'ocean', 'forest']

/**
 * Shown instead of the 500 page when the page broke because the connection
 * dropped. This page is drawn outside the providers and the app's styles, so
 * it carries its own: the words of the connection notice in English, as the
 * rest of this page is, and the person's light or dark theme. Try again
 * draws the page again in place once the connection is back.
 */
function ConnectionLost({ onRetry }: { onRetry: () => void }) {
  const [light, setLight] = useState(false)

  useEffect(() => {
    try {
      const theme = localStorage.getItem('torqvoice-theme') ?? 'dark'
      setLight(
        theme === 'system'
          ? !window.matchMedia('(prefers-color-scheme: dark)').matches
          : LIGHT_THEMES.includes(theme)
      )
    } catch {
      // Storage blocked: the app's default, dark
    }
  }, [])

  const c = light
    ? {
        bg: '#fafafa',
        fg: '#09090b',
        muted: '#71717a',
        card: '#ffffff',
        border: 'rgba(0,0,0,0.08)',
      }
    : {
        bg: '#09090b',
        fg: '#fafafa',
        muted: '#a1a1aa',
        card: 'rgba(255,255,255,0.03)',
        border: 'rgba(255,255,255,0.1)',
      }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          boxSizing: 'border-box',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: c.bg,
          color: c.fg,
        }}
      >
        <div
          style={{
            textAlign: 'center',
            width: '100%',
            maxWidth: 420,
            padding: 32,
            boxSizing: 'border-box',
            border: `1px solid ${c.border}`,
            borderRadius: 16,
            background: c.card,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              marginBottom: 24,
              borderRadius: 16,
              border: `1px solid ${c.border}`,
            }}
          >
            {/* lucide wifi-off, the icon of the connection notice */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ display: 'block' }}
            >
              <path d="M12 20h.01" />
              <path d="M8.5 16.429a5 5 0 0 1 7 0" />
              <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
              <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
              <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
              <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
              <path d="m2 2 20 20" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Couldn&apos;t reach Torqvoice
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: c.muted, margin: '0 0 32px' }}>
            Your last change may not have been saved. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 500,
              color: c.bg,
              background: c.fg,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
