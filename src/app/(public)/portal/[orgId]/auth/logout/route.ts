import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { CUSTOMER_SESSION_COOKIE } from '@/lib/customer-session'
import { db } from '@/lib/db'

/**
 * Signs the customer out: the session is deleted on the server and the
 * cookie in the browser.
 *
 * Under /portal and not /api/public, where it used to be: the session cookie
 * is scoped to the path "/portal", so the old address never received it. It
 * cleared the cookie and left the session row, still valid for anyone who
 * held the token, until it expired a week later.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  await params
  const cookieStore = await cookies()
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value

  if (token) {
    await db.customerSession.delete({ where: { token } }).catch(() => {
      /* already gone */
    })
  }

  cookieStore.delete({ name: CUSTOMER_SESSION_COOKIE, path: '/portal' })
  return NextResponse.json({ success: true })
}
