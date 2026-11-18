import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { type CustomerSessionData, getCustomerSession } from '@/lib/customer-session'

export type PortalResult<T = unknown> = {
  success: boolean
  data?: T
  error?: string
}

/**
 * Runs a portal action as the signed-in customer. The portal has its own
 * session (a customer is not an app user), so its actions go through this
 * and not `withAuth`. Every query inside is scoped by both ids it hands over.
 *
 * An action that changes anything says so with `writes`. While the workshop
 * is being restored from a backup (lib/backup/freeze.ts) such an action is
 * refused before it runs, as `withAuth` refuses the workshop's own: what a
 * customer wrote halfway through would be lost under the restore, and the
 * restore would fight it for the same rows. The refusal is an ordinary
 * failed result, which every portal screen already words in the customer's
 * language; reads go on as usual.
 *
 * Lives outside the action files on purpose: everything a 'use server' file
 * exports becomes callable from the browser, and this takes a function.
 */
export async function withPortalAuth<T>(
  action: (session: CustomerSessionData) => Promise<T>,
  options: { writes?: boolean } = {}
): Promise<PortalResult<T>> {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return { success: false, error: 'Not authenticated' }
    }

    if (options.writes && isRestoring(session.organizationId)) {
      return { success: false, error: RESTORE_IN_PROGRESS_MESSAGE }
    }

    const data = await action(session)
    return { success: true, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    console.error('[portalAction]', message)
    return { success: false, error: message }
  }
}
