import { beforeEach, describe, expect, it, vi } from 'vitest'

// The workshop's saved settings, and the request the document is made from.
let settings: { key: string; value: string }[] = []
let cookieLocale: string | undefined
let acceptLanguage: string | null = null
let outsideRequest = false

vi.mock('@/lib/db', () => ({
  db: { appSetting: { findMany: vi.fn(async () => settings) } },
}))

vi.mock('next/headers', () => ({
  cookies: async () => {
    if (outsideRequest) throw new Error('cookies was called outside a request scope')
    return {
      get: (name: string) =>
        name === 'locale' && cookieLocale ? { value: cookieLocale } : undefined,
    }
  },
  headers: async () => {
    if (outsideRequest) throw new Error('headers was called outside a request scope')
    return { get: (name: string) => (name === 'accept-language' ? acceptLanguage : null) }
  },
}))

const { resolveCustomerLocale, resolveDocumentLocale } = await import('@/i18n/locale-from-request')

function workshop(locale?: string, forced = false) {
  settings = []
  if (locale) settings.push({ key: 'workshop.locale', value: locale })
  if (forced) settings.push({ key: 'workshop.forceCustomerLocale', value: 'true' })
}

beforeEach(() => {
  workshop()
  cookieLocale = undefined
  acceptLanguage = null
  outsideRequest = false
})

describe('resolveDocumentLocale', () => {
  it('prints in the workshop language, not the language the user picked for their screens', async () => {
    workshop('fr')
    cookieLocale = 'en'
    acceptLanguage = 'en-US,en;q=0.9'
    expect(await resolveDocumentLocale('org')).toBe('fr')
  })

  it('uses the workshop language even when customer pages are not forced to it', async () => {
    workshop('fr', false)
    expect(await resolveDocumentLocale('org')).toBe('fr')
  })

  it('falls back to the language the user picked when the workshop has none saved', async () => {
    cookieLocale = 'fr'
    expect(await resolveDocumentLocale('org')).toBe('fr')
  })

  it('falls back to the browser language, the same one the app screens show', async () => {
    acceptLanguage = 'fr-FR,fr;q=0.9,en;q=0.8'
    expect(await resolveDocumentLocale('org')).toBe('fr')
  })

  it('ignores a saved language that is not one the app has', async () => {
    workshop('xx')
    cookieLocale = 'de'
    expect(await resolveDocumentLocale('org')).toBe('de')
  })

  it('uses English only outside a request with nothing saved', async () => {
    outsideRequest = true
    expect(await resolveDocumentLocale('org')).toBe('en')
  })

  it('uses the workshop language outside a request, as a scheduled mail does', async () => {
    outsideRequest = true
    workshop('nb')
    expect(await resolveDocumentLocale('org')).toBe('nb')
  })
})

describe('resolveCustomerLocale', () => {
  it('follows the customer browser when the workshop language is not forced', async () => {
    workshop('fr')
    expect(await resolveCustomerLocale('org', 'de-DE,de;q=0.9')).toBe('de')
  })

  it('uses the workshop language when forced', async () => {
    workshop('fr', true)
    expect(await resolveCustomerLocale('org', 'de-DE,de;q=0.9')).toBe('fr')
  })

  it('falls back to the workshop language, not English, when there is no browser to ask', async () => {
    workshop('fr')
    expect(await resolveCustomerLocale('org', null)).toBe('fr')
  })

  it('never reads the viewer cookie', async () => {
    cookieLocale = 'fr'
    expect(await resolveCustomerLocale('org', null)).toBe('en')
  })
})
