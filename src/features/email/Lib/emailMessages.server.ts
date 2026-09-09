import 'server-only'

import { defaultLocale, type Locale, locales } from '@/i18n/config'
import type { EmailMessages } from './emailPresets'

/**
 * The preset words and labels for one language, read straight from the
 * message file.
 *
 * Not next-intl's getTranslations, for two reasons. The presets quote tags
 * in braces, which ICU would take for arguments and demand values for. And
 * mail goes out from cron jobs and public routes with no request to hang a
 * locale off; a direct import works anywhere.
 */
export async function loadEmailMessages(locale: string): Promise<EmailMessages> {
  const chosen: Locale = (locales as readonly string[]).includes(locale)
    ? (locale as Locale)
    : defaultLocale
  try {
    return (await import(`../../../../messages/${chosen}/email.json`)).default as EmailMessages
  } catch {
    return (await import(`../../../../messages/${defaultLocale}/email.json`))
      .default as EmailMessages
  }
}
