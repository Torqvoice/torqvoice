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

  const select = {
    organizationId: true,
    role: true,
    roleId: true,
    customRole: {
      select: { isAdmin: true, permissions: { select: { action: true, subject: true } } },
    },
  } as const

  if (activeOrgCookie) {
    const m = await db.organizationMember.findFirst({
      where: { userId, organizationId: activeOrgCookie },
      select,
    })
    if (m) return m
  }

  return db.organizationMember.findFirst({ where: { userId }, select })
})
