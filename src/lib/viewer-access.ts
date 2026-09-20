import { getCachedMembership } from './cached-session'
import { getAuthContext } from './get-auth-context'
import { hasPermission, PermissionAction, type PermissionSubject } from './permissions'
import type { ActionResult } from './with-auth'

/**
 * What the person looking at a page may read, asked once, before the page
 * asks for anything.
 *
 * A page that shows several things at once (the dashboard shows sixteen) used
 * to ask for all of them and let `withAuth` refuse the ones this role may not
 * have. That is correct on screen, because a refused card is simply not
 * drawn, and wrong everywhere else: each refusal is a query that was never
 * going to be answered and a "permission denied" row in the audit log. A
 * Member opening the dashboard wrote twelve of them per visit, which buries
 * the one refusal an owner would actually want to see.
 *
 * So the page asks here first and does not make the call. The rules are the
 * ones `withAuth` applies, in the same order: a super admin, an owner, an
 * admin and an admin role read everything; anybody else reads what their role
 * was given, and somebody with no role reads nothing.
 *
 * This decides what to ask for, never what is allowed. `withAuth` still
 * guards every action, so a page that gets this wrong is refused as before.
 */
export interface ViewerAccess {
  reads(subject: PermissionSubject): boolean
}

export async function getViewerAccess(): Promise<ViewerAccess> {
  const auth = await getAuthContext()
  if (!auth) return { reads: () => false }
  if (auth.isAdmin) return { reads: () => true }

  const membership = await getCachedMembership(auth.userId)
  const granted = membership?.customRole?.permissions ?? []
  return {
    reads: (subject) => hasPermission(granted, { action: PermissionAction.READ, subject }),
  }
}

/**
 * Makes the call when the viewer may read `subject`, and otherwise answers as
 * `withAuth` would have, without the query and without the audit row. The
 * page handles both the same way, which is the point.
 */
export function readIfAllowed<T extends ActionResult<unknown>>(
  access: ViewerAccess,
  subject: PermissionSubject,
  call: () => Promise<T>
): Promise<T> {
  if (access.reads(subject)) return call()
  return Promise.resolve({
    success: false,
    error: 'Insufficient permissions',
    forbidden: true,
  } as T)
}
