/**
 * A text refused for its country reads as a plain sentence in the person's
 * language wherever they sent it from: the conversation, the Send dialog,
 * the tire hotel, or "Send now" on a scheduled message.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', async () => {
  const nb = (await import('../../../../messages/nb/messages.json')).default as {
    errors: Record<string, string>
  }
  return {
    getTranslations: async (ns: string) => {
      expect(ns).toBe('messages.errors')
      return (key: string) => nb.errors[key]
    },
  }
})

const { smsRefusalForPerson } = await import('@/features/sms/Lib/smsRefusalText.server')
const { SmsCountryRefusedError } = await import('@/lib/sms')
const nb = (await import('../../../../messages/nb/messages.json')).default as {
  errors: Record<string, string>
}

describe('the refusal a person reads', () => {
  it('tells a workshop on the Torqvoice account to connect its own provider', async () => {
    const refused = new SmsCountryRefusedError()
    refused.platform = true

    const shown = (await smsRefusalForPerson(refused)) as Error

    expect(shown.message).toBe(nb.errors.countryNotAvailable)
  })

  it('tells a workshop on its own Twilio to turn the country on', async () => {
    const shown = (await smsRefusalForPerson(new SmsCountryRefusedError())) as Error

    expect(shown.message).toBe(nb.errors.countryNotAllowedOwn)
  })

  it('leaves every other error as it was', async () => {
    const other = new Error('Customer not found')

    expect(await smsRefusalForPerson(other)).toBe(other)
  })
})
