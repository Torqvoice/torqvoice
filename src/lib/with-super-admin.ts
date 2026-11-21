import { headers } from 'next/headers'
import { type AuditEvent, logAudit } from './audit'
import { getCachedSession } from './cached-session'
import { db } from './db'
import { sessionOrganizationScope } from './session-scope'
import type { ActionResult } from './with-auth'
import { publicErrorMessage } from '@/lib/public-error-message'

type SuperAdminContext = {
  userId: string
}

type SuperAdminOptions<T> = {
  /**
   * Written after the action succeeds. A platform action belongs to no
   * workshop, so the row carries the acting account and no organization.
   */
  audit?: (result: T) => AuditEvent
}

async function requestMeta() {
  try {
    const h = await headers()
    const forwarded = h.get('x-forwarded-for')
    return {
      ip: forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
      userAgent: h.get('user-agent') || null,
    }
  } catch {
    return { ip: null, userAgent: null }
  }
}

export async function withSuperAdmin<T>(
  action: (ctx: SuperAdminContext) => Promise<T>,
  options: SuperAdminOptions<T> = {}
): Promise<ActionResult<T>> {
  try {
    const session = await getCachedSession()

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { isSuperAdmin: true },
    })

    // A session a workshop minted without a password (lib/session-scope.ts)
    // carries none of the account's platform rights.
    if (!user?.isSuperAdmin || sessionOrganizationScope(session)) {
      return { success: false, error: 'Forbidden' }
    }

    const data = await action({ userId: session.user.id })

    if (options.audit) {
      // Awaited, unlike withAuth's: these are rare, and the record of who
      // did it matters more than the few milliseconds. logAudit never throws.
      const meta = await requestMeta()
      const event = options.audit(data)
      // The row's link to the acting account is cleared if that account is
      // ever deleted, so who it was is written into the row as well.
      const actor = {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
      }
      await logAudit(
        { userId: session.user.id, organizationId: '' },
        { ...meta, ...event, metadata: { ...(event.metadata ?? {}), actor } }
      )
    }

    return { success: true, data }
  } catch (error) {
    // See withAuth: logged in full, shown only when it is the action's own.
    console.error('[withSuperAdmin] Error:', error)
    return { success: false, error: publicErrorMessage(error) }
  }
}
