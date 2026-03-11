import { auth } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

const { POST: authPOST, GET } = toNextJsHandler(auth)

// Path prefixes that need stricter rate limits.
// Better-auth registers sub-paths like /sign-in/email, /sign-up/email,
// /two-factor/verify-totp, etc., so we match by prefix.
const strictPrefixes: { prefix: string; limit: number; windowMs: number }[] = [
  { prefix: '/api/public/auth/sign-in', limit: 10, windowMs: 60_000 },
  { prefix: '/api/public/auth/two-factor/verify', limit: 10, windowMs: 60_000 },
  { prefix: '/api/public/auth/sign-up', limit: 5, windowMs: 60_000 },
  { prefix: '/api/public/auth/request-password-reset', limit: 5, windowMs: 60_000 },
  { prefix: '/api/public/auth/reset-password', limit: 5, windowMs: 60_000 },
  { prefix: '/api/public/auth/passkey', limit: 10, windowMs: 60_000 },
]

const authAuditPrefixes = [
  '/api/public/auth/sign-in',
  '/api/public/auth/two-factor/verify',
  '/api/public/auth/passkey',
]

const defaultConfig = { limit: 30, windowMs: 60_000 }

function getRequestIp(request: Request): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  )
}

async function POST(request: Request) {
  const { pathname } = new URL(request.url)
  const config = strictPrefixes.find((p) => pathname.startsWith(p.prefix)) ?? defaultConfig
  const limited = rateLimit(request, config)
  if (limited) return limited

  const isAuthAttempt = authAuditPrefixes.some((p) => pathname.startsWith(p))

  if (isAuthAttempt) {
    // Clone body before better-auth consumes it
    const cloned = request.clone()
    const response = await authPOST(request)

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
            typeof rawEmail === 'string' && rawEmail.length <= 255
              ? rawEmail
              : 'unknown'
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

  return authPOST(request)
}

export { GET, POST }
