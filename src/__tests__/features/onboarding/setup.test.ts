import { describe, expect, it, vi } from 'vitest'
// The first-run content is translated by next-intl itself, not the suite's stand-in.
vi.unmock('next-intl')

import fr from '../../../../messages/fr/onboarding.json'
import frPdf from '../../../../messages/fr/pdf.json'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { previewInvoiceInput } from '@/features/onboarding/Lib/previewInvoice'
import {
  initialDraft,
  parseTaxRate,
  type SetupDraft,
  setupPayload,
  taxStepComplete,
  withCountry,
  withKind,
} from '@/features/onboarding/Lib/setupDraft'
import { setupSettings } from '@/features/onboarding/Lib/setupSettings'
import { onboardingSchema } from '@/features/onboarding/Schema/onboardingSchema'

/** The French workshop from the complaint: an English browser in Lyon. */
function frenchWorkshop(): SetupDraft {
  return {
    ...initialDraft({ timeZone: 'Europe/Paris', languages: ['en-US', 'en'], uiLocale: 'en' }),
    workshopName: 'Garage Martin',
    taxRate: '20',
  }
}

describe('the first draft', () => {
  it('suggests French documents for a workshop in France, whatever the browser speaks', () => {
    const draft = frenchWorkshop()
    expect(draft).toMatchObject({
      country: 'FR',
      locale: 'fr',
      currencyCode: 'EUR',
      dateFormat: 'dd/MM/yyyy',
      timeFormat: '24h',
      timezone: 'Europe/Paris',
      distance: 'metric',
      measure: 'metric',
      dialCode: '+33',
      taxLabel: 'TVA',
    })
  })

  it('gives a British workshop miles with litres', () => {
    const draft = initialDraft({ timeZone: 'Europe/London', languages: ['en-GB'], uiLocale: 'en' })
    expect(draft).toMatchObject({
      country: 'GB',
      distance: 'imperial',
      measure: 'metric',
      currencyCode: 'GBP',
    })
  })

  it('waits for a country when the browser does not say', () => {
    const draft = initialDraft({ timeZone: 'UTC', languages: ['en'], uiLocale: 'de' })
    expect(draft.country).toBeNull()
    expect(draft.locale).toBe('de')
  })
})

describe('changing the country or the kind of work', () => {
  it('moves the regional choices and keeps the name, address and a typed tax name', () => {
    const typed = {
      ...frenchWorkshop(),
      address: 'Lyon',
      taxLabel: 'Taxe locale',
      taxLabelEdited: true,
    }
    const german = withCountry(typed, 'DE', 'en-US')
    expect(german).toMatchObject({
      country: 'DE',
      locale: 'de',
      dateFormat: 'dd.MM.yyyy',
      dialCode: '+49',
      workshopName: 'Garage Martin',
      address: 'Lyon',
      taxLabel: 'Taxe locale',
    })
  })

  it('suggests a new tax name while the owner has not typed one', () => {
    expect(withCountry(frenchWorkshop(), 'NO', undefined).taxLabel).toBe('MVA')
  })

  it('writes engine size in cc for motorcycles and back in litres for cars', () => {
    const bikes = withKind(frenchWorkshop(), 'motorcycles')
    expect(bikes.engineSizeUnit).toBe('cc')
    expect(withKind(bikes, 'cars').engineSizeUnit).toBe('litres')
  })
})

describe('the tax step', () => {
  it('needs a rate between 0 and 100 when the workshop charges tax', () => {
    expect(parseTaxRate('20')).toBe(20)
    expect(parseTaxRate('5,5')).toBe(5.5)
    expect(parseTaxRate('')).toBeNull()
    expect(parseTaxRate('120')).toBeNull()
    expect(taxStepComplete({ ...frenchWorkshop(), taxRate: '' })).toBe(false)
    expect(taxStepComplete({ ...frenchWorkshop(), taxChoice: 'no', taxRate: '' })).toBe(true)
    expect(taxStepComplete({ ...frenchWorkshop(), taxChoice: 'skipped', taxRate: '' })).toBe(true)
  })
})

describe('what gets saved', () => {
  it('passes the onboarding schema', () => {
    expect(onboardingSchema.safeParse(setupPayload(frenchWorkshop())).success).toBe(true)
  })

  it('writes every choice as the settings pages save it', () => {
    const payload = onboardingSchema.parse(
      setupPayload({ ...frenchWorkshop(), address: '8 avenue Jean Jaurès, Lyon' })
    )
    expect(setupSettings(payload.setup!, payload.timeZone)).toEqual({
      'workshop.serviceType': 'automotive',
      'workshop.locale': 'fr',
      'workshop.forceCustomerLocale': 'false',
      'workshop.currencyCode': 'EUR',
      'workshop.dateFormat': 'dd/MM/yyyy',
      'workshop.timeFormat': '24h',
      'workshop.unitSystem': 'metric',
      'workshop.measureSystem': 'metric',
      'workshop.engineSizeUnit': 'litres',
      'workshop.defaultCountryCode': '+33',
      'workshop.taxEnabled': 'true',
      'workshop.defaultTaxRate': '20',
      'workshop.taxInclusive': 'false',
      'workshop.taxLabel': 'TVA',
      'workshop.address': '8 avenue Jean Jaurès, Lyon',
      'workshop.timezone': 'Europe/Paris',
    })
  })

  it('switches tax off when the step was skipped', () => {
    const payload = onboardingSchema.parse(
      setupPayload({ ...frenchWorkshop(), taxChoice: 'skipped' })
    )
    const rows = setupSettings(payload.setup!, payload.timeZone)
    expect(rows['workshop.taxEnabled']).toBe('false')
    expect(rows['workshop.defaultTaxRate']).toBe('0')
    expect(rows['workshop.taxLabel']).toBeUndefined()
  })

  it('leaves engine size out for a boat workshop', () => {
    const payload = onboardingSchema.parse(setupPayload(withKind(frenchWorkshop(), 'marine')))
    const rows = setupSettings(payload.setup!, payload.timeZone)
    expect(rows['workshop.serviceType']).toBe('marine')
    expect(rows['workshop.engineSizeUnit']).toBeUndefined()
  })

  it('refuses a currency or country the app does not know', () => {
    const payload = setupPayload(frenchWorkshop())
    expect(
      onboardingSchema.safeParse({ ...payload, setup: { ...payload.setup, currencyCode: 'XXX' } })
        .success
    ).toBe(false)
    expect(
      onboardingSchema.safeParse({ ...payload, setup: { ...payload.setup, country: 'ZZ' } }).success
    ).toBe(false)
  })

  it('still accepts the old form, with no setup', () => {
    expect(
      onboardingSchema.safeParse({ workshopName: 'Garage', loadSampleData: false }).success
    ).toBe(true)
  })
})

describe('the preview', () => {
  it('is drawn by the real invoice builder, in French, with the TVA line and euro totals', () => {
    const draft = { ...frenchWorkshop(), address: '8 avenue Jean Jaurès, Lyon' }
    const spec = buildInvoicePrintSpec(
      previewInvoiceInput(
        draft,
        invoiceLabels(frPdf, 'invoice'),
        fr.setup.sample,
        new Date(Date.UTC(2026, 9, 28, 12))
      )
    )
    const text = JSON.stringify(spec)
    expect(text).toContain('Garage Martin')
    expect(text).toContain('FACTURE')
    expect(text).toContain('Facturer à')
    expect(text).toContain('TVA (20%)')
    expect(text).toContain('28/10/2026')
    expect(text).toMatch(/132,48\s€/)
  })
})

describe('the first-run content', () => {
  it('is written in the language customers get, not the screens', async () => {
    const { onboardingTranslator } = await import('@/features/onboarding/Lib/onboardingTranslator')
    const t = await onboardingTranslator('fr')
    expect(t('sample.prefix')).toBe('Exemple :')
    expect(t('sample.parts.oilFilter')).toBe('Filtre à huile')
    expect((await onboardingTranslator('nb'))('sample.parts.oilFilter')).toBe('Oljefilter')
  })
})
