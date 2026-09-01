import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * Which logo a printed or shared document uses.
 *
 * A workshop's letterhead is not always the mark the app wears: a shop may
 * want a wider version on paper, or one with the postal address set into it,
 * without changing the badge in their own sidebar. So the documents may carry
 * their own, and fall back to the company logo when they do not, which is
 * what every sheet printed before the two could differ.
 *
 * Invoices and quotes are kept apart because everything else about their
 * appearance already is.
 */
export function documentLogoPath(
  settings: Record<string, string | undefined | null>,
  documentType: 'invoice' | 'quote'
): string {
  const own =
    documentType === 'quote'
      ? settings[SETTING_KEYS.QUOTE_LOGO]
      : settings[SETTING_KEYS.INVOICE_LOGO]
  return own?.trim() || settings[SETTING_KEYS.COMPANY_LOGO]?.trim() || ''
}
