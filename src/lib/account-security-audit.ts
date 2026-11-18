import { auditDetails, logAudit, type AuditEvent } from '@/lib/audit'
import { db } from '@/lib/db'
import { describeUserAgent } from '@/lib/user-agent-label'

/**
 * Two-factor sign-in and passkeys change through better-auth's own routes,
 * which no server action wraps, so none of it reached the audit log although
 * the security docs say every one of these events is there. lib/auth.ts calls
 * these from its hooks.
 */

/** The headers the auth config reads a caller's address from, in order. See lib/auth.ts. */
export const AUTH_IP_HEADERS =
  process.env.TRUST_CF_CONNECTING_IP === 'true' ? ['cf-connecting-ip', 'x-real-ip'] : ['x-real-ip']

/** The parts of a better-auth hook context these read. */
export type AuthHookContext = {
  path?: string
  body?: unknown
  request?: Request
  headers?: Headers
  context?: {
    returned?: unknown
    newSession?: { user: { id: string } } | null
  }
}

function headersOf(ctx: AuthHookContext | null | undefined) {
  return ctx?.request?.headers ?? ctx?.headers ?? null
}

function clientIp(headers: Headers | null) {
  for (const name of AUTH_IP_HEADERS) {
    const value = headers?.get(name)
    if (value) return value
  }
  return null
}

/**
 * Written to the workshop the account works in, the same one its sign-ins
 * go to, with the address and browser the change came from.
 */
async function logAccountEvent(
  userId: string,
  event: Pick<AuditEvent, 'action' | 'details' | 'metadata'>,
  ctx: AuthHookContext | null | undefined
) {
  const headers = headersOf(ctx)
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    select: { organizationId: true },
  })
  await logAudit(
    { userId, organizationId: membership?.organizationId ?? '' },
    {
      ...event,
      entity: 'User',
      entityId: userId,
      ip: clientIp(headers),
      userAgent: headers?.get('user-agent') ?? null,
    }
  )
}

/**
 * From the user update hook. The two-factor routes switch `twoFactorEnabled`
 * and change nothing else on the user, so an update made from one of them is
 * the switch being turned on or off.
 */
export async function auditTwoFactorChange(
  user: { id: string; twoFactorEnabled?: boolean | null },
  ctx: AuthHookContext | null | undefined
) {
  if (!ctx?.path?.startsWith('/two-factor/')) return
  await logAccountEvent(
    user.id,
    user.twoFactorEnabled
      ? { action: 'auth.twoFactorEnabled', details: auditDetails('auth_twoFactorEnabled') }
      : { action: 'auth.twoFactorDisabled', details: auditDetails('auth_twoFactorDisabled') },
    ctx
  )
}

/** A passkey's row is gone by the time the delete route answers, so its name is read first. */
const passkeysBeingRemoved = new WeakMap<Request, { userId: string; name: string }>()

/** From the before hook. */
export async function rememberPasskeyBeforeRemoval(ctx: AuthHookContext) {
  if (ctx.path !== '/passkey/delete-passkey' || !ctx.request) return
  const id = (ctx.body as { id?: unknown } | undefined)?.id
  if (typeof id !== 'string') return
  const passkey = await db.passkey.findFirst({
    where: { id },
    select: { userId: true, name: true },
  })
  if (passkey) {
    passkeysBeingRemoved.set(ctx.request, {
      userId: passkey.userId,
      name: passkey.name || 'Passkey',
    })
  }
}

/** From the after hook: what the passkey and backup-code routes did, once they succeeded. */
export async function auditAccountSecurityRoute(ctx: AuthHookContext) {
  const returned = ctx.context?.returned
  // A refused request comes back as an APIError; nothing changed.
  if (!returned || returned instanceof Error) return

  if (ctx.path === '/passkey/verify-registration') {
    const passkey = returned as { userId?: string; name?: string | null }
    if (!passkey.userId) return
    // The app names a passkey after the device it is made on; one added
    // without a name is called the same thing here.
    const name = passkey.name || describeUserAgent(headersOf(ctx)?.get('user-agent'))
    await logAccountEvent(
      passkey.userId,
      { action: 'auth.passkeyAdded', details: auditDetails('auth_passkeyAdded', { name }) },
      ctx
    )
    return
  }

  if (ctx.path === '/passkey/delete-passkey') {
    const removed = ctx.request ? passkeysBeingRemoved.get(ctx.request) : undefined
    if (!removed) return
    passkeysBeingRemoved.delete(ctx.request as Request)
    await logAccountEvent(
      removed.userId,
      {
        action: 'auth.passkeyRemoved',
        details: auditDetails('auth_passkeyRemoved', { name: removed.name }),
      },
      ctx
    )
    return
  }

  if (ctx.path === '/two-factor/verify-backup-code') {
    const userId = ctx.context?.newSession?.user.id
    if (!userId) return
    await logAccountEvent(
      userId,
      { action: 'auth.backupCodeUsed', details: auditDetails('auth_backupCodeUsed') },
      ctx
    )
  }
}
