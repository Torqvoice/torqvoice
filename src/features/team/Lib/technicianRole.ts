import type { PrismaClient } from '@/generated/prisma/client'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * What the technician app needs to work, expressed once.
 *
 * `withApiAuth` enforces `requiredPermissions` exactly as `withAuth` does,
 * deliberately, so that an API cannot disagree with the web app about who may
 * do what. Which means a technician with no role is refused by every screen in
 * the app, not only by the office: creating accounts with no role at all made
 * an app that returned "Your role does not allow this" to everything.
 *
 * So they get a real role, visible on the team page, narrowable by hand, and
 * containing nothing beyond what the endpoints actually ask for. A test walks
 * every route under /api/v1/tech and fails if one of them needs something this
 * set does not carry.
 */
export const TECHNICIAN_PERMISSIONS = [
  // Their own jobs, and the parts and labour on them.
  { action: PermissionAction.READ, subject: PermissionSubject.SERVICES },
  { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
  // Looking a scanned barcode up against stock. Read only: booking a part out
  // goes through the job, not through inventory.
  { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
] as const

/**
 * The one word the team page uses for this, in the role column and nowhere
 * else. There used to be a Technician toggle beside a role that could also be
 * called Technician, meaning different things, which is a sentence nobody
 * should have to read twice.
 */
export const TECHNICIAN_ROLE_NAME = 'Technician'

/** The value the role dropdown uses for it, alongside `admin` and `member`. */
export const TECHNICIAN_ROLE_VALUE = 'technician'

type Tx = Pick<PrismaClient, 'role'>

/**
 * The workshop's technician role, made once and reused after that.
 *
 * Not `isAdmin`: that would bypass permission checks entirely and hide what
 * the account can reach behind a flag, which is the exact shape of the bug
 * this product just finished removing.
 */
export async function ensureTechnicianRole(tx: Tx, organizationId: string): Promise<string> {
  const existing = await tx.role.findFirst({
    where: { organizationId, name: TECHNICIAN_ROLE_NAME },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await tx.role.create({
    data: {
      name: TECHNICIAN_ROLE_NAME,
      organizationId,
      isAdmin: false,
      permissions: {
        create: TECHNICIAN_PERMISSIONS.map((p) => ({ action: p.action, subject: p.subject })),
      },
    },
    select: { id: true },
  })
  return created.id
}

/**
 * The domain the desk-created accounts get instead of an email address.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve or be registered,
 * so a placeholder here fails locally rather than escaping to somebody's real
 * inbox. It exists because `User.email` is required and unique, and a mechanic
 * set up at a counter has no address to put there.
 *
 * It is never shown to anybody. See `contactFor`.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = 'technician.torqvoice.invalid'

/** Whether this address is one of ours rather than a real one. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
}

/**
 * What to show under somebody's name.
 *
 * Their email if they have one, their mobile if the address is a placeholder,
 * and nothing rather than a machine-generated string nobody can act on. A
 * technician is identified by the number they sign in with, so that is the
 * useful thing to print.
 */
export function contactFor(user: { email?: string | null; phone?: string | null }): string {
  if (!isPlaceholderEmail(user.email)) return user.email ?? ''
  return user.phone ?? ''
}
