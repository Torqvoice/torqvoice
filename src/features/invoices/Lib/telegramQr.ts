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

/** The t.me link a bot's username resolves to. */
export function telegramBotLink(username: string): string {
  return `https://t.me/${username.replace(/^@/, '')}`
}

export interface TelegramQr {
  link: string
  dataUri: string
}

/**
 * The code to print for this organisation's sheet, or null when the design
 * leaves the block off or no bot is connected. A failing lookup or encoder
 * costs the code, never the document.
 */
export async function telegramQrForPrint(
  organizationId: string,
  layout: Pick<InvoiceLayoutConfig, 'sections'>
): Promise<TelegramQr | null> {
  if (!telegramQrWanted(layout)) return null
  try {
    const username = await getOrgTelegramBotUsername(organizationId)
    if (!username) return null
    const link = telegramBotLink(username)
    return { link, dataUri: await generateQrDataUri(link, 200) }
  } catch (error) {
    console.error('[telegram] Could not build the invoice QR code:', error)
    return null
  }
}
