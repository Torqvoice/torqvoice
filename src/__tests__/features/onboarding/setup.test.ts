import { describe, expect, it, vi } from 'vitest'
// The first-run content is translated by next-intl itself, not the suite's stand-in.
vi.unmock('next-intl')

import fr from '../../../../messages/fr/onboarding.json'
import frPdf from '../../../../messages/fr/pdf.json'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { withMarineDocumentLabels } from '@/features/invoice-designer/Lib/marineLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { pickerScore } from '@/features/onboarding/Components/setup/SearchPicker'
import { countrySearchTerms } from '@/lib/country-defaults'
import { exampleDate } from '@/features/onboarding/Components/setup/StepRegion'
import { previewInvoiceInput } from '@/features/onboarding/Lib/previewInvoice'
import { starterDesignSettings, starterLayout } from '@/features/onboarding/Lib/starterDesign'
import {
  initialDraft,
  parseTaxRate,
  type SetupDraft,
  setupPayload,
  taxStepComplete,
  firstIncompleteStep,
  withCountry,
  withCustomerLanguage,
  withKind,
  withLanguage,
  withSameLanguage,
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

describe('creating from Ready', () => {
  // Ready is reachable from the step bar after an earlier step was emptied again.
  it('finds the first step still missing something', () => {
    expect(firstIncompleteStep(frenchWorkshop())).toBeNull()
    expect(firstIncompleteStep({ ...frenchWorkshop(), taxRate: '' })).toBe('tax')
    expect(firstIncompleteStep({ ...frenchWorkshop(), taxRate: '150' })).toBe('tax')
    expect(firstIncompleteStep({ ...frenchWorkshop(), dialCode: '33' })).toBe('region')
    expect(firstIncompleteStep({ ...frenchWorkshop(), dialCode: '' })).toBeNull()
    expect(
      firstIncompleteStep({ ...frenchWorkshop(), workshopName: ' G ', dialCode: 'x', taxRate: '' })
    ).toBe('workshop')
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
    // Four parts and four labour lines, 302,45 € before tax.
    expect(text).toContain('Huile moteur 5W-30')
    expect(text).toContain('4,5 l')
    expect(text).toContain('Contrôle des freins')
    expect(text).toMatch(/302,45\s€/)
    expect(text).toMatch(/362,94\s€/)
    expect(text).toContain('camille.dubois@example.com')
  })

  it('measures the oil in quarts for a workshop on US measures', () => {
    const us = withCountry(frenchWorkshop(), 'US', 'en-US')
    const text = JSON.stringify(
      buildInvoicePrintSpec(
        previewInvoiceInput(us, invoiceLabels(frPdf, 'invoice'), fr.setup.sample)
      )
    )
    expect(text).toContain('5 qt')
  })

  it('uses the boat yard words for a marine workshop', () => {
    const marine = withKind(frenchWorkshop(), 'marine')
    const labels = withMarineDocumentLabels(invoiceLabels(frPdf, 'invoice'), frPdf)
    const text = JSON.stringify(
      buildInvoicePrintSpec(previewInvoiceInput(marine, labels, fr.setup.sample))
    )
    expect(text).toContain(frPdf.invoice.vehicleMarine)
    expect(text).toContain('Yamaha')
    const cars = JSON.stringify(
      buildInvoicePrintSpec(
        previewInvoiceInput(frenchWorkshop(), invoiceLabels(frPdf, 'invoice'), fr.setup.sample)
      )
    )
    expect(cars).not.toContain(frPdf.invoice.vehicleMarine)
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

describe('the dates row', () => {
  // 13:05 UTC on 29 October 2026, after Europe moved its clocks back.
  const now = new Date(Date.UTC(2026, 9, 29, 13, 5))

  it('shows the time now at the workshop', () => {
    expect(exampleDate('dd.MM.yyyy', '24h', true, 'Europe/Oslo', now)).toBe('29.10.2026, 14:05')
    expect(exampleDate('MM/dd/yyyy', '12h', true, 'America/New_York', now)).toBe(
      '10/29/2026, 9:05 AM'
    )
  })

  it('shows the workshop its own date where it is already tomorrow', () => {
    expect(exampleDate('dd/MM/yyyy', '24h', true, 'Pacific/Auckland', now)).toBe(
      '30/10/2026, 02:05'
    )
  })

  it('writes midnight and noon on a 12-hour clock', () => {
    expect(
      exampleDate('dd/MM/yyyy', '12h', true, 'UTC', new Date(Date.UTC(2026, 0, 5, 0, 0)))
    ).toBe('05/01/2026, 12:00 AM')
    expect(
      exampleDate('dd/MM/yyyy', '12h', true, 'UTC', new Date(Date.UTC(2026, 0, 5, 12, 0)))
    ).toBe('05/01/2026, 12:00 PM')
  })

  it('falls back to the browser zone for a zone it does not know', () => {
    expect(exampleDate('yyyy-MM-dd', '24h', false, 'Not/AZone', now)).toMatch(/^2026-10-(29|30)$/)
  })
})

describe('searching the pickers', () => {
  const uk = `Storbritannia ${countrySearchTerms('GB')} GB`
  const ukraine = `Ukraina ${countrySearchTerms('UA')} UA`

  it('puts the United Kingdom above Ukraine for "UK"', () => {
    expect(pickerScore(uk, 'UK')).toBeGreaterThan(pickerScore(ukraine, 'UK'))
  })

  it('does not match letters scattered through a name', () => {
    expect(pickerScore(`Usbekistan ${countrySearchTerms('UZ')} UZ`, 'UK')).toBe(0)
  })

  it('finds by the start of any word and by a phrase', () => {
    expect(pickerScore(uk, 'engl')).toBeGreaterThan(0)
    expect(pickerScore(uk, 'great brit')).toBeGreaterThan(0)
    expect(pickerScore('Norske kroner (NOK) NOK', 'nok')).toBe(1)
    expect(pickerScore('America/Los Angeles America/Los_Angeles', 'los angeles')).toBeGreaterThan(0)
  })
})

describe('the language', () => {
  it('starts from the browser, and a detected country suggests its own', () => {
    expect(
      initialDraft({ timeZone: 'UTC', languages: ['de'], uiLocale: 'de' }).languageSource
    ).toBe('browser')
    expect(frenchWorkshop()).toMatchObject({ locale: 'fr', languageSource: 'country' })
  })

  it('follows a country the owner picks while they have not picked a language', () => {
    const norwegianPc = initialDraft({ timeZone: 'Europe/Oslo', languages: ['nb'], uiLocale: 'nb' })
    expect(withCountry(norwegianPc, 'GB', 'nb')).toMatchObject({
      locale: 'en',
      languageSource: 'country',
      currencyCode: 'GBP',
    })
  })

  it('suggests English where the app does not ship the country language', () => {
    const norwegianPc = initialDraft({ timeZone: 'Europe/Oslo', languages: ['nb'], uiLocale: 'nb' })
    expect(withCountry(norwegianPc, 'SE', 'nb')).toMatchObject({
      locale: 'en',
      currencyCode: 'SEK',
    })
    expect(withCountry(norwegianPc, 'JP', 'nb').locale).toBe('en')
  })

  it('keeps a language the owner picked, whatever country follows', () => {
    const picked = withLanguage(
      initialDraft({ timeZone: 'Europe/Oslo', languages: ['nb'], uiLocale: 'nb' }),
      'nb'
    )
    expect(withCountry(picked, 'ES', 'nb')).toMatchObject({
      country: 'ES',
      locale: 'nb',
      languageSource: 'chosen',
      currencyCode: 'EUR',
    })
  })

  it('uses a picked language among those a country speaks', () => {
    const picked = withLanguage(
      initialDraft({ timeZone: 'Europe/Oslo', languages: ['nb'], uiLocale: 'nb' }),
      'nl'
    )
    expect(withCountry(picked, 'BE', 'en-US')).toMatchObject({ locale: 'nl', taxLabel: 'BTW' })
  })
})

describe('one language, and customers on another only when asked', () => {
  const norwegianPc = () =>
    initialDraft({ timeZone: 'Europe/Oslo', languages: ['nb'], uiLocale: 'nb' })

  it('gives everything the owner language where the country speaks it', () => {
    expect(norwegianPc()).toMatchObject({ locale: 'nb', customerLanguageSeparate: false })
  })

  it('opens the customer language by itself where the detected country speaks another', () => {
    expect(frenchWorkshop()).toMatchObject({ locale: 'fr', customerLanguageSeparate: true })
  })

  it('keeps a separate customer language when the owner changes their own', () => {
    expect(withLanguage(frenchWorkshop(), 'de')).toMatchObject({
      locale: 'fr',
      customerLanguageSeparate: true,
      languageSource: 'chosen',
    })
  })

  it('moves customers with the owner while they share it', () => {
    expect(withLanguage(norwegianPc(), 'de').locale).toBe('de')
  })

  it('puts customers back on the owner language', () => {
    expect(withSameLanguage(frenchWorkshop(), 'en')).toMatchObject({
      locale: 'en',
      customerLanguageSeparate: false,
    })
  })

  it('keeps a picked customer language when the country changes', () => {
    const picked = withCustomerLanguage(norwegianPc(), 'de')
    expect(withCountry(picked, 'ES', 'nb')).toMatchObject({
      locale: 'de',
      customerLanguageSeparate: true,
      currencyCode: 'EUR',
    })
  })

  it('folds a separate language away when a country suggests one for everything', () => {
    expect(withCountry(frenchWorkshop(), 'GB', 'en-US')).toMatchObject({
      locale: 'en',
      customerLanguageSeparate: false,
    })
  })
})

describe('the time zone', () => {
  it('moves to the picked country unless the browser is already there', () => {
    const norwegianPc = initialDraft({ timeZone: 'Europe/Oslo', languages: ['nb'], uiLocale: 'nb' })
    expect(norwegianPc.timezone).toBe('Europe/Oslo')
    expect(withCountry(norwegianPc, 'IE', 'nb').timezone).toBe('Europe/Dublin')
    expect(withCountry(norwegianPc, 'NO', 'nb').timezone).toBe('Europe/Oslo')
  })
})

describe('the starter template', () => {
  it('gives a new workshop the Compact template for invoices and quotes', () => {
    const rows = starterDesignSettings()
    for (const prefix of ['invoice', 'quote']) {
      expect(rows[`${prefix}.headerStyle`]).toBe('compact')
      expect(rows[`${prefix}.activeDesign`]).toBe('preset:compact')
      const layout = JSON.parse(rows[`${prefix}.layoutConfig`])
      expect(layout.version).toBe(3)
      expect(layout.document).toMatchObject({ fontSize: 9, margin: 30 })
    }
  })

  it('prints the title, the number and the dates on the invoices of a new workshop', () => {
    for (const prefix of ['invoice', 'quote']) {
      const layout = JSON.parse(starterDesignSettings()[`${prefix}.layoutConfig`])
      const title = layout.sections.find((s: { id: string }) => s.id === 'document_title')
      expect(title?.visible).toBe(true)
    }
  })

  it('is a layout the schema accepts, every section accounted for', () => {
    const layout = starterLayout()
    expect(layout.sections.find((s) => s.id === 'customer')).toMatchObject({
      visible: true,
      boxed: false,
    })
    expect(layout.sections.find((s) => s.id === 'findings')?.visible).toBe(false)
  })

  it('is what the preview draws', () => {
    const spec = buildInvoicePrintSpec(
      previewInvoiceInput(frenchWorkshop(), invoiceLabels(frPdf, 'invoice'), fr.setup.sample)
    )
    expect(spec.page.fontSize).toBe(9)
    expect(spec.page.margin.left).toBe(30)
  })
})
