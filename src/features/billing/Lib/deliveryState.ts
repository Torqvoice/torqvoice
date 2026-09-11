/**
 * How far an invoice got towards the customer.
 *
 * Payment status answers whether the money arrived. This answers whether the
 * invoice was ever opened, which is what says who to chase: one sent a week
 * ago and never read has probably landed in a spam folder.
 *
 * Only a link can be seen to have been opened. An invoice emailed with the
 * PDF attached is read in the mail client and leaves no trace, so "sent"
 * means sent rather than unread.
 */
export type DeliveryState = 'unsent' | 'sent' | 'viewed'

export function deliveryState(record: {
  sentAt: string | Date | null
  viewCount: number
}): DeliveryState {
  if (record.viewCount > 0) return 'viewed'
  return record.sentAt ? 'sent' : 'unsent'
}
