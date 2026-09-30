import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { isDemoBlockedAuthPath } from '@/lib/demo-auth-paths'
import { limitAuthRequest } from '@/lib/auth-rate-limit'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { explainInvalidOrigin } from '@/lib/auth-origin-hint'
import { attachDeviceCookie, withDeviceCookie } from '@/lib/device-cookie'

const { POST: authPOST, GET: authGET } = toNextJsHandler(auth)

const authAuditPrefixes = [
  '/api/public/auth/sign-in',
  '/api/public/auth/two-factor/verify',
  '/api/public/auth/passkey',
]

/**
 * better-auth's own endpoints bypass server actions, so demoGuard() never sees
 * them. Without this, a demo visitor could change the shared demo user's
 * password, name or address, enroll 2FA or a passkey on it, or list and sign
 * out every other visitor. The list is in lib/demo-auth-paths.ts.
 */
function refuseOnDemo(pathname: string): NextResponse | null {
  if (!isDemoMode || !isDemoBlockedAuthPath(pathname)) return null
  const error =
    'This action is disabled on the demo. Install Torqvoice on your own server to use it.'
  // `message` as well, which is what the better-auth client shows.
  return NextResponse.json({ error, message: error }, { status: 403 })
}

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

/** OAuth callbacks arrive as GET and create sessions too. */
async function GET(incoming: Request) {
  // list-sessions is a GET, and on the demo it is every visitor's address.
  const refused = refuseOnDemo(new URL(incoming.url).pathname)
  if (refused) return refused

  const { request, issued } = withDeviceCookie(incoming)
  return attachDeviceCookie(await authGET(request), issued)
}

async function POST(incoming: Request) {
  // The browser's device id, minted here when it has none, so the session
  // hook can tell a returning device from a new one.
  const { request, issued } = withDeviceCookie(incoming)
  const { pathname } = new URL(request.url)

  const refused = refuseOnDemo(pathname)
  if (refused) return refused

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
    const response = attachDeviceCookie(
      await explainInvalidOrigin(cloned, await authPOST(request)),
      issued
    )

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

  return attachDeviceCookie(await explainInvalidOrigin(request, await authPOST(request)), issued)
}

export { GET, POST }
