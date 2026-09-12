import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { limitAuthRequest } from '@/lib/auth-rate-limit'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { explainInvalidOrigin } from '@/lib/auth-origin-hint'

const { POST: authPOST, GET } = toNextJsHandler(auth)

const authAuditPrefixes = [
  '/api/public/auth/sign-in',
  '/api/public/auth/two-factor/verify',
  '/api/public/auth/passkey',
]

// better-auth's own endpoints bypass server actions, so demoGuard() never sees
// them. Without this, a demo visitor can change the shared demo user's
// password or enroll 2FA/passkeys on it, locking the demo for everyone until
// the next reset.
const demoBlockedPrefixes = [
  '/api/public/auth/change-password',
  '/api/public/auth/set-password',
  '/api/public/auth/two-factor',
  '/api/public/auth/passkey',
]

function getRequestIp(request: Request): string | null {
  // Same precedence as lib/rate-limit.ts: Cloudflare's header cannot be forged
  // by clients on proxied traffic; the first x-forwarded-for entry can.
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  )
}

async function POST(request: Request) {
  const { pathname } = new URL(request.url)

  if (isDemoMode && demoBlockedPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.json(
      {
        error:
          'This action is disabled on the demo. Install Torqvoice on your own server to use it.',
      },
      { status: 403 }
    )
  }

  // The end-to-end suite signs in on nearly every test and loads the sign-in
  // page more often still, each load a passkey probe on the same prefix; its
  // server runs with the limiter off. Nothing else sets this variable.
  if (process.env.AUTH_RATE_LIMIT !== 'off') {
    const limited = limitAuthRequest(request, pathname)
    if (limited) return limited
  }

  const isAuthAttempt = authAuditPrefixes.some((p) => pathname.startsWith(p))

  if (isAuthAttempt) {
    // Clone body before better-auth consumes it
    const cloned = request.clone()
    const response = await explainInvalidOrigin(cloned, await authPOST(request))

    // Log failed authentication attempts (fire-and-forget to avoid timing side-channels)
    if (!response.ok) {
      const ip = getRequestIp(cloned)
      const userAgent = cloned.headers.get('user-agent')
      const status = response.status
      void (async () => {
        try {
          const body = await cloned.json().catch(() => null)
          const rawEmail = body?.email
          // Sanitize: must be a string, cap length to prevent log pollution
          const email =
            typeof rawEmail === 'string' && rawEmail.length <= 255 ? rawEmail : 'unknown'
          // Try to find user to attach userId
          const user =
            email !== 'unknown'
              ? await db.user.findFirst({ where: { email }, select: { id: true } })
              : null
          const membership = user
            ? await db.organizationMember.findFirst({
                where: { userId: user.id },
                select: { organizationId: true },
              })
            : null
          await logAudit(
            { userId: user?.id ?? '', organizationId: membership?.organizationId ?? '' },
            {
              action: 'auth.loginFailed',
              message: `Failed login attempt for ${email}`,
              metadata: { email, statusCode: status, path: pathname },
              ip,
              userAgent,
            }
          )
        } catch {
          /* best-effort */
        }
      })()
    }

    return response
  }

  return explainInvalidOrigin(request, await authPOST(request))
}

export { GET, POST }
