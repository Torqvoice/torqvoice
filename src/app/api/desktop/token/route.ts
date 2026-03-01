import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 10 })
  if (limited) return limited

  const { code, code_verifier } = await request.json()
  if (!code || !code_verifier) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // Look up the authorization code
  const verification = await db.verification.findUnique({
    where: { identifier: `desktop-auth:${code}` },
  })

  if (!verification) {
    return NextResponse.json({ error: 'Invalid authorization code' }, { status: 400 })
  }

  // Delete immediately (single-use)
  await db.verification.delete({
    where: { identifier: `desktop-auth:${code}` },
  })

  // Validate expiry
  if (verification.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Authorization code expired' }, { status: 400 })
  }

  const { codeChallenge, userId, state } = JSON.parse(verification.value)

  // PKCE validation: verify code_verifier matches the stored code_challenge
  const hash = createHash('sha256').update(code_verifier).digest('base64url')
  if (hash !== codeChallenge) {
    return NextResponse.json({ error: 'Invalid code verifier' }, { status: 400 })
  }

  // Create a session token
  const sessionToken = randomBytes(32).toString('hex')

  await db.session.create({
    data: {
      token: sessionToken,
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  // Update last login
  await db.user.update({
    where: { id: userId },
    data: { lastLogin: new Date() },
  })

  // Fetch user data
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  })

  return NextResponse.json({
    token: sessionToken,
    user,
  })
}
