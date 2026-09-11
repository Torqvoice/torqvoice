import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import { generateQrDataUri } from '@/lib/qr'
import { getOrgTelegramBotUsername } from '@/lib/telegram'

/**
 * The Telegram code a sheet prints, resolved the same way for every copy.
 *
 * Whether it prints is the design's decision: the Telegram QR block is
 * switched on or off in the designer, and the layout the sheet is built from
 * (an issued invoice's frozen one, a draft's live one) is what is asked.
 * What it links to is the connected bot's, read through the integration so
 * a bot set up before the catalogue existed is found as well. One place for
 * both questions, because the PDF, the shared page and the portal used to
 * answer them separately and drifted: one still read the bot's name from a
 * row the integration no longer writes, and printed nothing.
 */

export const TELEGRAM_QR_SECTION = 'telegram_qr'

/** Whether the design has the Telegram block switched on. */
export function telegramQrWanted(layout: Pick<InvoiceLayoutConfig, 'sections'>): boolean {
  return layout.sections.some((s) => s.id === TELEGRAM_QR_SECTION && s.visible)
}

/**
 * The t.me link a bot's username resolves to. With a customer, it is the deep
 * link that ties the scanner's chat to that customer: pressing Start then
 * sends `/start <customerId>`, which the webhook links. Without one the bot
 * only opens, and a bare `/start` links nobody, which is what the invoice
 * used to print and why a customer scanning it stayed unknown.
 */
export function telegramBotLink(username: string, customerId?: string | null): string {
  const base = `https://t.me/${username.replace(/^@/, '')}`
  return customerId ? `${base}?start=${encodeURIComponent(customerId)}` : base
}

/** The customer a document is for: its own, or the owner of the vehicle it is on. */
export function documentCustomerId(record: {
  customerId?: string | null
  vehicle?: { customerId?: string | null } | null
}): string | null {
  return record.customerId ?? record.vehicle?.customerId ?? null
}

export interface TelegramQr {
  link: string
  dataUri: string
}

/**
 * The code to print for this organisation's sheet, linking the scanner to
 * the document's customer, or null when the design leaves the block off or
 * no bot is connected. A failing lookup or encoder
 * costs the code, never the document.
 */
export async function telegramQrForPrint(
  organizationId: string,
  layout: Pick<InvoiceLayoutConfig, 'sections'>,
  customerId?: string | null
): Promise<TelegramQr | null> {
  if (!telegramQrWanted(layout)) return null
  try {
    const username = await getOrgTelegramBotUsername(organizationId)
    if (!username) return null
    const link = telegramBotLink(username, customerId)
    return { link, dataUri: await generateQrDataUri(link, 200) }
  } catch (error) {
    console.error('[telegram] Could not build the invoice QR code:', error)
    return null
  }
}
