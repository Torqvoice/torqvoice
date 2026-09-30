import { rateLimit } from '@/lib/rate-limit'

/**
 * How often one caller may knock on the sign-in door.
 *
 * Better Auth registers sub-paths such as /sign-in/email, /sign-up/email and
 * /two-factor/verify-totp, so the budgets are matched by prefix. Everything
 * else on the auth route shares one looser budget.
 */
const strictPrefixes: { prefix: string; limit: number; windowMs: number }[] = [
  { prefix: '/api/public/auth/sign-in', limit: 10, windowMs: 60_000 },
  { prefix: '/api/public/auth/two-factor/verify', limit: 10, windowMs: 60_000 },
  { prefix: '/api/public/auth/sign-up', limit: 5, windowMs: 60_000 },
  { prefix: '/api/public/auth/request-password-reset', limit: 5, windowMs: 60_000 },
  { prefix: '/api/public/auth/reset-password', limit: 5, windowMs: 60_000 },
  { prefix: '/api/public/auth/passkey', limit: 10, windowMs: 60_000 },
]

const defaultConfig = { limit: 30, windowMs: 60_000 }

/**
 * A 429 when this caller has used up the budget for `pathname`, else null.
 *
 * Nobody arrives here with a session: this is where sessions are made. So the
 * caller is always counted by address (`anonymous`), never by whatever they
 * put in an Authorization header. Without that, the limiter took any bearer
 * value as an identity of its own, and a fresh made-up token on every request
 * was a fresh budget for guessing passwords, reset tokens and 2FA codes.
 */
export function limitAuthRequest(request: Request, pathname: string): Response | null {
  const config = strictPrefixes.find((p) => pathname.startsWith(p.prefix)) ?? defaultConfig
  return rateLimit(request, { ...config, anonymous: true })
}
