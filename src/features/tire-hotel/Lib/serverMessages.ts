import { cookies } from 'next/headers'

type Messages = Record<string, unknown>

/**
 * The tire hotel's own translations, inside a server action.
 *
 * Anything an action writes to a quote, a work order or an invoice ends up in
 * front of a customer, so it has to be in the workshop's language. Server
 * actions have no request context to read a locale from, only the cookie, so
 * the messages are loaded by hand here rather than through next-intl.
 *
 * One reader for the lot, because there were three of these written slightly
 * differently and the fourth would have been written differently again.
 * Falls back to English rather than throwing: a line in the wrong language
 * still bills correctly, an exception does not.
 */
export async function tireHotelMessages(): Promise<Messages> {
  const locale = (await cookies()).get('locale')?.value || 'en'
  try {
    return (await import(`../../../../messages/${locale}/tireHotel.json`)).default as Messages
  } catch {
    return (await import('../../../../messages/en/tireHotel.json')).default as Messages
  }
}

function group(messages: Messages, key: string): Record<string, string> {
  const value = messages[key]
  return value && typeof value === 'object' ? (value as Record<string, string>) : {}
}

/** What each kind of prep work is called, for a labour line. */
export async function treatmentNames(): Promise<Record<string, string>> {
  const messages = await tireHotelMessages()
  const treatments = messages.treatments
  if (treatments && typeof treatments === 'object' && 'types' in treatments) {
    const types = (treatments as { types?: unknown }).types
    if (types && typeof types === 'object') return types as Record<string, string>
  }
  return {}
}

/** The words the storage line on an invoice is built from. */
export async function invoiceLineWords(): Promise<{ storage: string; pieces: string }> {
  const line = group(await tireHotelMessages(), 'invoiceLine')
  return {
    storage: line.storage ?? 'Tire storage',
    pieces: line.pieces ?? 'pcs',
  }
}

/**
 * The lines written into a work order's notes.
 *
 * These print on the job sheet and the PDF, so they are read by the
 * technician doing the work, in whatever language the workshop runs in.
 */
export async function jobNoteWords(): Promise<Record<string, string>> {
  return group(await tireHotelMessages(), 'jobNotes')
}

/**
 * What a set of tires is called, per season.
 *
 * One phrase per season rather than a season word and a noun to join, because
 * plenty of languages compound them. "vinterdekk" is one word in Norwegian
 * and "pneus hiver" is two in French, and neither falls out of stitching
 * "winter" onto "tires".
 */
export async function seasonNames(): Promise<Record<string, string>> {
  return group(await tireHotelMessages(), 'setNames')
}
