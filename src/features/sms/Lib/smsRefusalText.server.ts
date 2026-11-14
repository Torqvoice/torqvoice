import 'server-only'
import { getTranslations } from 'next-intl/server'
import { SmsCountryRefusedError } from '@/lib/sms'

/**
 * The error a person should see for a failed text, in their language.
 *
 * A text refused for its country becomes a plain sentence saying what they can
 * do about it; anything else comes back unchanged. Called at each action that
 * answers a person, after the English message has been stored for the record.
 */
export async function smsRefusalForPerson(error: unknown): Promise<unknown> {
  if (!(error instanceof SmsCountryRefusedError)) return error
  const t = await getTranslations('messages.errors')
  return new Error(t(error.platform ? 'countryNotAvailable' : 'countryNotAllowedOwn'))
}
