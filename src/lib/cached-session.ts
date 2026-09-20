import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { auth } from './auth'
import { db } from './db'

export const getCachedSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export const getCachedMembership = cache(async (userId: string) => {
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
export async function resolveMembership(userId: string, preferredOrganizationId?: string) {
  if (preferredOrganizationId) {
    const preferred = await db.organizationMember.findFirst({
      where: { userId, organizationId: preferredOrganizationId },
      select: MEMBERSHIP_SELECT,
    })
    if (preferred) return preferred
  }
  return db.organizationMember.findFirst({ where: { userId }, select: MEMBERSHIP_SELECT })
}
