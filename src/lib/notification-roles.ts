/**
 * Who the workshop's notification feed is for.
 *
 * Every member may open the live socket (that is how a work order stays
 * current for whoever has it open), but the notification feed is the
 * workshop's own inbox: payments, messages, what an admin acts on. The
 * action that reads it and the socket that pushes it have to agree, so the
 * rule lives here and both import it.
 */
export function readsNotifications(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'super_admin'
}
