'use server'

import { revalidatePath } from 'next/cache'
import { getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { classifyUserAgent, describeUserAgent, type DeviceKind } from '@/lib/known-devices'
import { logAudit } from '@/lib/audit'
import { demoGuard } from '@/lib/demo'
import { z } from 'zod'

export interface SignedInDevice {
  id: string
  label: string
  kind: DeviceKind
  ip: string | null
  createdAt: string
  lastActiveAt: string
  current: boolean
}

/**
 * The account's open sessions, newest first, as devices a person can
 * recognise. Self-scoped by construction: the session decides the user, and
 * every query below carries that user id.
 */
export async function listMyDevices(): Promise<SignedInDevice[]> {
  const session = await getCachedSession()
  if (!session?.user?.id) return []
  const rows = await db.session.findMany({
    where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, updatedAt: true },
  })
  return rows.map((row) => ({
    id: row.id,
    label: describeUserAgent(row.userAgent),
    kind: classifyUserAgent(row.userAgent),
    ip: row.ipAddress ?? null,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.updatedAt.toISOString(),
    current: row.id === session.session.id,
  }))
}

const sessionIdSchema = z.string().min(1).max(200)

/**
 * Ends one of the caller's own sessions. Deleting the row is what better-auth's
 * own revoke does; a browser holding a cached cookie keeps rendering pages for
 * up to five minutes and is then refused everywhere.
 */
export async function signOutDevice(input: unknown) {
  // The demo's one account is shared by every visitor; nobody gets to sign
  // the others out.
  demoGuard()
  const session = await getCachedSession()
  if (!session?.user?.id) return { success: false as const, error: 'Unauthorized' }
  const id = sessionIdSchema.parse(input)

  const { count } = await db.session.deleteMany({ where: { id, userId: session.user.id } })
  if (count === 0) return { success: false as const, error: 'Not found' }

  logAudit(
    { userId: session.user.id, organizationId: '' },
    { action: 'auth.sessionRevoked', message: 'Signed out a device' }
  ).catch(() => undefined)
  revalidatePath('/settings/account')
  return { success: true as const }
}

/** Ends every session of the caller's except the one making the call. */
export async function signOutOtherDevices() {
  demoGuard()
  const session = await getCachedSession()
  if (!session?.user?.id) return { success: false as const, error: 'Unauthorized' }

  const { count } = await db.session.deleteMany({
    where: { userId: session.user.id, id: { not: session.session.id } },
  })
  logAudit(
    { userId: session.user.id, organizationId: '' },
    { action: 'auth.sessionsRevoked', message: `Signed out ${count} other device(s)` }
  ).catch(() => undefined)
  revalidatePath('/settings/account')
  return { success: true as const, data: { count } }
}
