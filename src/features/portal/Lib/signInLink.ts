import 'server-only'

import { db } from '@/lib/db'

/**
 * The sign-in link a customer gets by email, between the click and the
 * session.
 *
 * Opening the link must not spend it. Mail services open every link in a
 * message before the reader does (Defender Safe Links, Gmail's scanners, a
 * phone's preview), and a link that signs in on a plain GET is used up by
 * that visit: the customer then lands on "already used" every time. So the
 * GET only remembers the token in a cookie and shows a page with one button,
 * and the button's POST is what redeems it. A scanner does not press buttons.
 *
 * The cookie rather than the page address carries the token, so a token that
 * still works is never in a URL the page's analytics or a Referer can see.
 */
export const SIGN_IN_LINK_COOKIE = 'customer-signin'

export type SignInLinkProblem = 'invalid' | 'used' | 'expired'

/** What the login page says for each way a link can be no good. */
export const SIGN_IN_LINK_ERRORS: Record<SignInLinkProblem, string> = {
  invalid: 'Invalid or expired link.',
  used: 'This link has already been used. Please request a new one.',
  expired: 'This link has expired. Please request a new one.',
}

export type SignInLinkState =
  | { ok: true; id: string; email: string }
  | { ok: false; problem: SignInLinkProblem }

/** Whether a token can still sign someone in to this workshop. Reads only. */
export async function checkSignInLink(
  organizationId: string,
  token: string
): Promise<SignInLinkState> {
  const link = await db.customerMagicLink.findUnique({ where: { token } })

  if (!link || link.organizationId !== organizationId) return { ok: false, problem: 'invalid' }
  if (link.usedAt) return { ok: false, problem: 'used' }
  if (new Date() > link.expiresAt) return { ok: false, problem: 'expired' }

  return { ok: true, id: link.id, email: link.email }
}

/**
 * Spend a link. False when someone else spent it first: two presses of the
 * button, or the same mail open on two devices, yield one session.
 */
export async function redeemSignInLink(id: string): Promise<boolean> {
  const { count } = await db.customerMagicLink.updateMany({
    where: { id, usedAt: null },
    data: { usedAt: new Date() },
  })
  return count === 1
}
