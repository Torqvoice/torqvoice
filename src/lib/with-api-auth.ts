import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { auth } from './auth'
import { db } from './db'
import { hasAllPermissions, type PermissionInput } from './permissions'
import { rateLimit } from './rate-limit'

/**
 * Request wrapper for the token-authenticated API the technician app talks to.
 *
 * Deliberately not a copy of `withAuth`. That one serves server actions: it
 * reads a cookie, returns `{ success, data }` and lets the error text through
 * to a caller that is our own UI. This one faces a client we do not control on
 * a device we do not own, so it authenticates from a header, answers in HTTP
 * status codes, and never lets an internal message reach the wire.
 *
 * What it does NOT do is reimplement session handling. The bearer plugin is
 * registered in `./auth`, so `auth.api.getSession` resolves an
 * `Authorization: Bearer <token>` header through Better Auth's own machinery.
 * Querying the session table directly would work right up until a session is
 * revoked, a password changes, or a token is rotated, and then it would keep
 * on working, which is the bug.
 */

export type ApiAuthContext = {
  userId: string
  organizationId: string
  role: string
  isSuperAdmin: boolean
  isAdmin: boolean
  /**
   * Every technician row this user owns in the active organization. A person
   * can hold more than one (a shop that lanes its board by speciality gives
   * the same mechanic a row per lane), so jobs are always looked up with
   * `in: technicianIds`, never by a single id.
   */
  technicianIds: string[]
}

type WithApiAuthOptions = {
  requiredPermissions?: PermissionInput[]
  /**
   * Refuse the request unless the user is an active technician in the active
   * organization. The technician app has no screen that means anything for an
   * office user, and an empty job list would read as "no work today" rather
   * than "you are not set up as a technician".
   */
  requireTechnician?: boolean
  /** Per-IP-and-path budget. Defaults to the shared 30-per-minute. */
  rateLimit?: { limit?: number; windowMs?: number }
}

/** Machine-readable codes so the app can branch without parsing prose. */
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_technician'
  | 'no_organization'
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'server_error'

export function apiError(status: number, code: ApiErrorCode, message: string, extra?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(extra ? { details: extra } : {}) } },
    { status }
  )
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status })
}

export async function withApiAuth(
  request: Request,
  handler: (ctx: ApiAuthContext) => Promise<NextResponse>,
  options: WithApiAuthOptions = {}
): Promise<NextResponse> {
  // Cheap rejections first: a flood of unauthenticated requests should cost a
  // map lookup, not a database round trip.
  //
  // Note this limiter is per-process and in-memory. Behind more than one app
  // container the effective budget is the limit times the container count.
  // Good enough to blunt a runaway client; not a defence against a determined
  // attacker, which would need a shared store.
  const limited = rateLimit(request, options.rateLimit)
  if (limited) return limited

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return apiError(401, 'unauthorized', 'Missing bearer token.')
  }

  let session: Awaited<ReturnType<typeof auth.api.getSession>>
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {
    // A malformed token is a client mistake, not a server fault.
    return apiError(401, 'unauthorized', 'Invalid or expired token.')
  }

  if (!session?.user?.id) {
    return apiError(401, 'unauthorized', 'Invalid or expired token.')
  }

  const userId = session.user.id

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  })
  const isSuperAdmin = user?.isSuperAdmin ?? false

  // The app names which workshop it is talking to, because a user may belong
  // to several. The header only selects; it never grants. Membership is what
  // decides, and an id the user is not a member of falls through to their
  // default rather than erroring, so a stale header cannot lock the app out.
  const requestedOrgId = request.headers.get('x-org-id')

  const memberSelect = {
    organizationId: true,
    role: true,
    roleId: true,
    customRole: {
      select: { isAdmin: true, permissions: { select: { action: true, subject: true } } },
    },
  } as const

  let membership = requestedOrgId
    ? await db.organizationMember.findFirst({
        where: { userId, organizationId: requestedOrgId },
        select: memberSelect,
      })
    : null

  if (!membership) {
    membership = await db.organizationMember.findFirst({
      where: { userId },
      select: memberSelect,
    })
  }

  if (!membership?.organizationId) {
    return apiError(403, 'no_organization', 'This account is not a member of any workshop.')
  }

  const organizationId = membership.organizationId
  const isOwnerOrAdmin = membership.role === 'owner' || membership.role === 'admin'
  const roleIsAdmin = membership.customRole?.isAdmin === true

  // Mirrors `withAuth` exactly, including the part that surprises people: a
  // member with no custom role assigned is unrestricted. That is the product's
  // existing meaning of "no role", and the API must not quietly disagree with
  // the web app about who may do what.
  if (!isSuperAdmin && options.requiredPermissions?.length) {
    const hasNoCustomRole = !membership.roleId
    if (!isOwnerOrAdmin && !roleIsAdmin && !hasNoCustomRole) {
      const granted = membership.customRole?.permissions ?? []
      if (!hasAllPermissions(granted, options.requiredPermissions)) {
        return apiError(403, 'forbidden', 'Your role does not allow this.')
      }
    }
  }

  const technicians = await db.technician.findMany({
    where: { organizationId, userId, isActive: true },
    select: { id: true },
  })
  const technicianIds = technicians.map((t) => t.id)

  if (options.requireTechnician && technicianIds.length === 0) {
    return apiError(
      403,
      'not_technician',
      'This account is not set up as a technician in this workshop. Ask the workshop to add you.'
    )
  }

  try {
    return await handler({
      userId,
      organizationId,
      role: isSuperAdmin ? 'super_admin' : (membership.role ?? 'member'),
      isSuperAdmin,
      isAdmin: isSuperAdmin || isOwnerOrAdmin || roleIsAdmin,
      technicianIds,
    })
  } catch (err) {
    // Zod messages describe the caller's own payload, so they are safe and
    // genuinely useful to return. Everything else is ours and stays here.
    if (err instanceof ZodError) {
      return apiError(
        400,
        'invalid_request',
        'The request body was not valid.',
        err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }))
      )
    }
    if (err instanceof SyntaxError) {
      return apiError(400, 'invalid_request', 'The request body was not valid JSON.')
    }
    console.error('[api]', request.method, new URL(request.url).pathname, err)
    return apiError(500, 'server_error', 'Something went wrong. Try again.')
  }
}
