import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { auth } from './auth'
import { db } from './db'
import { SCOPED_SESSION_MESSAGE, sessionOrganizationScope } from './session-scope'

export const getCachedSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export const getCachedMembership = cache(async (userId: string) => {
  // A session minted from a setup code or a one-time code is bound to the
  // workshop that minted it, and neither the header nor the cookie below may
  // name another (lib/session-scope.ts).
  const scope = await getCachedSessionScope()
  if (scope) return resolveMembership(userId, scope, { bound: true })

  const cookieStore = await cookies()

  // Which workshop the caller means.
  //
  // The web app says so with a cookie. The technician app cannot: it holds a
  // bearer token and sends no cookies at all, so it names the workshop in a
  // header instead. Reading only the cookie meant every part of the app
  // outside `withApiAuth` silently resolved a multi-workshop user to whichever
  // membership came back first — so a technician viewing a photo from their
  // second workshop was refused it, and their live-update socket subscribed to
  // the wrong one.
  //
  // Neither value grants anything. Both only select, and the membership lookup
  // below is what decides.
  const activeOrgHeader = (await headers()).get('x-org-id') ?? undefined
  const activeOrgCookie = activeOrgHeader ?? cookieStore.get('active-org-id')?.value

  return resolveMembership(userId, activeOrgCookie)
})

const MEMBERSHIP_SELECT = {
  organizationId: true,
  role: true,
  roleId: true,
  customRole: {
    select: { isAdmin: true, permissions: { select: { action: true, subject: true } } },
  },
} as const

/**
 * The workshop a person is acting in: the one they named when they belong to
 * it, otherwise one they do belong to.
 *
 * The one place this is decided. The live-update socket used to decide it for
 * itself and treated the cookie as a requirement instead of a preference, so
 * a browser holding a stale `active-org-id` (left over from somebody else's
 * sign-in on the same machine) used the whole app normally and was refused
 * its socket: no live updates and nobody's chips, with nothing to say why.
 *
 * The name is only ever a preference. What is returned is always a membership
 * this person really has, so nothing here can place anybody in a workshop
 * they are not a member of.
 */
export async function resolveMembership(
  userId: string,
  preferredOrganizationId?: string,
  options: { bound?: boolean } = {}
) {
  if (preferredOrganizationId) {
    const preferred = await db.organizationMember.findFirst({
      where: { userId, organizationId: preferredOrganizationId },
      select: MEMBERSHIP_SELECT,
    })
    if (preferred) return preferred
  }
  // A session bound to a workshop has no other to fall back to. If the person
  // has left it, the session is good for nothing, and saying so is better
  // than quietly placing them in a workshop that never vouched for it.
  if (options.bound) return null
  return db.organizationMember.findFirst({ where: { userId }, select: MEMBERSHIP_SELECT })
}

/**
 * The workshop the current request's session is bound to, or null for an
 * ordinary sign-in.
 */
export async function getCachedSessionScope(): Promise<string | null> {
  return sessionOrganizationScope(await getCachedSession())
}

/**
 * Refuses a session bound to one workshop.
 *
 * For actions that belong to the account rather than to a workshop: changing
 * the email, deleting the account, starting a new workshop. A workshop that
 * signed a phone in without a password can vouch for the person inside that
 * workshop and nowhere else, and these reach everywhere.
 */
export async function assertAccountSession(): Promise<void> {
  if (await getCachedSessionScope()) throw new Error(SCOPED_SESSION_MESSAGE)
}
