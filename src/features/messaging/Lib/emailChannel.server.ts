import 'server-only'

import { canEmailCustomers } from '@/features/email/Lib/emailAllowance'
import { usesPlatformMail } from '@/lib/email'
import { replyMailEnabled } from '@/lib/reply-mail'

/**
 * Whether the inbox has an email channel for this workshop.
 *
 * - `active`: the cloud instance, and the workshop sends through the
 *   platform's address, so replies come back to the inbox.
 * - `ownVendor`: the cloud instance, but the workshop connected its own mail
 *   vendor. Its mail leaves from its own address and replies go there; the
 *   inbox shows the channel disabled with that reason, and any history.
 * - `off`: not the cloud instance. The channel is nowhere to be seen.
 */
export type EmailChannelState = 'active' | 'ownVendor' | 'off'

export async function emailChannelState(organizationId: string): Promise<EmailChannelState> {
  if (!replyMailEnabled()) return 'off'
  if (!(await usesPlatformMail(organizationId))) return 'ownVendor'
  return (await canEmailCustomers(organizationId)) ? 'active' : 'off'
}
