import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 5 })
  if (limited) return limited

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { codeChallenge, state } = await request.json()
  if (!codeChallenge || !state) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  const code = randomBytes(32).toString('hex')

  await db.verification.create({
    data: {
      identifier: `desktop-auth:${code}`,
      value: JSON.stringify({
        codeChallenge,
        userId: session.user.id,
        state,
      }),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  })

  return NextResponse.json({
    redirect_uri: `torqvoice://auth/callback?code=${code}&state=${state}`,
  })
}
