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
 * Lives outside the action files on purpose: everything a 'use server' file
 * exports becomes callable from the browser, and this takes a function.
 */
export async function withPortalAuth<T>(
  action: (session: CustomerSessionData) => Promise<T>
): Promise<PortalResult<T>> {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return { success: false, error: 'Not authenticated' }
    }

    const data = await action(session)
    return { success: true, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    console.error('[portalAction]', message)
    return { success: false, error: message }
  }
}
