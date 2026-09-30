import { describe, expect, it } from 'vitest'
import {
  EMPTY_WARRANTY,
  normalizeWarranty,
  switchWarrantyStatement,
  warrantyFromUntyped,
  type WarrantyFields,
  type WarrantyTexts,
} from '@/lib/warranty'
import {
  readWarrantyDefaults,
  warrantyExpiryFor,
  warrantyFieldsForNewDocument,
  warrantyTextsOf,
} from '@/features/settings/Lib/warrantyDefaults'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { warrantyForPrint } from '@/features/invoice-designer/Pdf/warrantyPrint'

/**
 * What a document says about the workshop's warranty: included, not included,
 * or nothing. The rules live in one place because a quote, the work order made
 * from it and the invoice printed from that all have to say the same thing.
 */

const TEXTS: WarrantyTexts = {
  includedTerms: '12 months on parts and labour.',
  notIncludedText: 'No workshop warranty on customer-supplied parts.',
  defaultMonths: 12,
  defaultMileage: 20000,
}

describe('normalizeWarranty', () => {
  it('stores nothing when nothing is said', () => {
    expect(normalizeWarranty({})).toEqual(EMPTY_WARRANTY)
    expect(
      normalizeWarranty({ warrantyStatus: null, warrantyMonths: 0, warrantyNotes: '  ' })
    ).toEqual(EMPTY_WARRANTY)
  })

  it('reads a filled field with no statement as an included warranty', () => {
    // Every job saved before the statement existed looks like this.
    expect(normalizeWarranty({ warrantyMonths: 12 })).toEqual({
      warrantyStatus: 'included',
      warrantyMonths: 12,
      warrantyMileage: null,
      warrantyNotes: null,
    })
    expect(normalizeWarranty({ warrantyNotes: 'Parts only' }).warrantyStatus).toBe('included')
  })

  it('never keeps a period beside "not included"', () => {
    expect(
      normalizeWarranty({
        warrantyStatus: 'not_included',
        warrantyMonths: 12,
        warrantyMileage: 20000,
        warrantyNotes: ' Customer parts ',
      })
    ).toEqual({
      warrantyStatus: 'not_included',
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: 'Customer parts',
    })
  })

  it("clears everything, terms included, on the editor's 'none'", () => {
    expect(
      normalizeWarranty({ warrantyStatus: 'none', warrantyMonths: 12, warrantyNotes: 'Terms' })
    ).toEqual(EMPTY_WARRANTY)
  })

  it('keeps "included" as a statement even with no detail', () => {
    expect(normalizeWarranty({ warrantyStatus: 'included' })).toEqual({
      ...EMPTY_WARRANTY,
      warrantyStatus: 'included',
    })
  })

  it('drops zero, negative and fractional leftovers', () => {
    const stored = normalizeWarranty({
      warrantyStatus: 'included',
      warrantyMonths: -3,
      warrantyMileage: 1500.9,
    })
    expect(stored.warrantyMonths).toBeNull()
    expect(stored.warrantyMileage).toBe(1500)
  })

  it('treats an unknown statement like no statement', () => {
    expect(normalizeWarranty({ warrantyStatus: 'lifetime' })).toEqual(EMPTY_WARRANTY)
    expect(
      normalizeWarranty({ warrantyStatus: 'lifetime', warrantyMonths: 6 }).warrantyStatus
    ).toBe('included')
  })
})

describe('warrantyFromUntyped', () => {
  it('reads an old backup row, which has months and no statement', () => {
    expect(warrantyFromUntyped({ warrantyMonths: 24, warrantyNotes: 'Parts and labour' })).toEqual({
      warrantyStatus: 'included',
      warrantyMonths: 24,
      warrantyMileage: null,
      warrantyNotes: 'Parts and labour',
    })
  })

  it('drops values of the wrong type instead of storing them', () => {
    expect(warrantyFromUntyped({ warrantyMonths: '12', warrantyStatus: 5 })).toEqual(EMPTY_WARRANTY)
  })
})

describe('switchWarrantyStatement', () => {
  it('fills an untouched panel from the workshop defaults', () => {
    expect(switchWarrantyStatement(EMPTY_WARRANTY, 'included', TEXTS)).toEqual({
      warrantyStatus: 'included',
      warrantyMonths: 12,
      warrantyMileage: 20000,
      warrantyNotes: TEXTS.includedTerms,
    })
  })

  it('swaps the stock text when the statement changes, and clears the period', () => {
    const included = switchWarrantyStatement(EMPTY_WARRANTY, 'included', TEXTS)
    expect(switchWarrantyStatement(included, 'not_included', TEXTS)).toEqual({
      warrantyStatus: 'not_included',
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: TEXTS.notIncludedText,
    })
  })

  it('keeps words somebody typed for this customer', () => {
    const typed: WarrantyFields = {
      warrantyStatus: 'included',
      warrantyMonths: 6,
      warrantyMileage: null,
      warrantyNotes: 'Six months, clutch only.',
    }
    expect(switchWarrantyStatement(typed, 'not_included', TEXTS).warrantyNotes).toBe(
      'Six months, clutch only.'
    )
  })

  it('keeps a period somebody chose when coming back to "included"', () => {
    const custom: WarrantyFields = {
      warrantyStatus: 'included',
      warrantyMonths: 6,
      warrantyMileage: null,
      warrantyNotes: null,
    }
    const back = switchWarrantyStatement(custom, 'included', TEXTS)
    expect(back.warrantyMonths).toBe(6)
    expect(back.warrantyMileage).toBeNull()
  })

  it('clears the lot when nothing is to be stated', () => {
    const included = switchWarrantyStatement(EMPTY_WARRANTY, 'included', TEXTS)
    expect(switchWarrantyStatement(included, null, TEXTS)).toEqual(EMPTY_WARRANTY)
  })

  it('works for a workshop that has written no texts at all', () => {
    const bare: WarrantyTexts = {
      includedTerms: '',
      notIncludedText: '',
      defaultMonths: null,
      defaultMileage: null,
    }
    expect(switchWarrantyStatement(EMPTY_WARRANTY, 'not_included', bare)).toEqual({
      ...EMPTY_WARRANTY,
      warrantyStatus: 'not_included',
    })
  })
})

describe('warranty defaults', () => {
  const settings = {
    [SETTING_KEYS.WARRANTY_DEFAULT_STATUS]: 'included',
    [SETTING_KEYS.WARRANTY_DEFAULT_MONTHS]: '12',
    [SETTING_KEYS.WARRANTY_DEFAULT_MILEAGE]: '20000',
    [SETTING_KEYS.WARRANTY_DEFAULT_TERMS]: ' 12 months on parts and labour. ',
    [SETTING_KEYS.WARRANTY_NOT_INCLUDED_TEXT]: 'No workshop warranty.',
  }

  it('a workshop that never opened the page gets documents that say nothing', () => {
    const defaults = readWarrantyDefaults({})
    expect(defaults.status).toBeNull()
    expect(defaults.applyToQuotes).toBe(true)
    expect(defaults.applyToWorkOrders).toBe(true)
    expect(warrantyFieldsForNewDocument(defaults, 'quote')).toEqual(EMPTY_WARRANTY)
    expect(warrantyFieldsForNewDocument(defaults, 'workOrder')).toEqual(EMPTY_WARRANTY)
  })

  it('starts a new quote and a new work order from the included default', () => {
    const expected = {
      warrantyStatus: 'included',
      warrantyMonths: 12,
      warrantyMileage: 20000,
      warrantyNotes: '12 months on parts and labour.',
    }
    const defaults = readWarrantyDefaults(settings)
    expect(warrantyFieldsForNewDocument(defaults, 'quote')).toEqual(expected)
    expect(warrantyFieldsForNewDocument(defaults, 'workOrder')).toEqual(expected)
  })

  it('starts from "not included" with its own text and no period', () => {
    const defaults = readWarrantyDefaults({
      ...settings,
      [SETTING_KEYS.WARRANTY_DEFAULT_STATUS]: 'not_included',
    })
    expect(warrantyFieldsForNewDocument(defaults, 'quote')).toEqual({
      warrantyStatus: 'not_included',
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: 'No workshop warranty.',
    })
  })

  it('leaves one kind of document alone when its switch is off', () => {
    const defaults = readWarrantyDefaults({
      ...settings,
      [SETTING_KEYS.WARRANTY_APPLY_TO_QUOTES]: 'false',
    })
    expect(warrantyFieldsForNewDocument(defaults, 'quote')).toEqual(EMPTY_WARRANTY)
    expect(warrantyFieldsForNewDocument(defaults, 'workOrder').warrantyStatus).toBe('included')
  })

  it("reads the saved 'none' as saying nothing", () => {
    const defaults = readWarrantyDefaults({
      ...settings,
      [SETTING_KEYS.WARRANTY_DEFAULT_STATUS]: 'none',
    })
    expect(defaults.status).toBeNull()
    // The texts are still there for an editor to fill in by hand.
    expect(warrantyTextsOf(defaults).includedTerms).toBe('12 months on parts and labour.')
    expect(warrantyTextsOf(defaults).defaultMonths).toBe(12)
  })
})

describe('warrantyExpiryFor', () => {
  const included: WarrantyFields = {
    warrantyStatus: 'included',
    warrantyMonths: 12,
    warrantyMileage: null,
    warrantyNotes: null,
  }

  it("counts the months on the workshop's calendar", () => {
    const expires = warrantyExpiryFor(included, new Date('2026-09-18T10:00:00Z'), 'Europe/Lisbon')
    expect(expires?.toISOString()).toBe('2027-09-18T10:00:00.000Z')
  })

  it('clamps to the end of a shorter month', () => {
    const expires = warrantyExpiryFor(
      { ...included, warrantyMonths: 1 },
      new Date('2026-01-31T12:00:00Z'),
      'UTC'
    )
    expect(expires?.toISOString()).toBe('2026-02-28T12:00:00.000Z')
  })

  it('has no expiry without a period, and none for "not included"', () => {
    const date = new Date('2026-09-18T10:00:00Z')
    expect(warrantyExpiryFor({ ...included, warrantyMonths: null }, date, 'UTC')).toBeNull()
    expect(
      warrantyExpiryFor({ ...EMPTY_WARRANTY, warrantyStatus: 'not_included' }, date, 'UTC')
    ).toBeNull()
    expect(warrantyExpiryFor(EMPTY_WARRANTY, date, 'UTC')).toBeNull()
  })
})

describe('warrantyForPrint', () => {
  const labels = {
    warrantyMonthsUnit: 'meses',
    warrantyNotIncluded: 'Garantia da oficina não incluída',
    warrantyStatutoryRights: 'Os seus direitos legais não são afetados.',
    warrantyIncluded: 'Incluída',
    km: 'km',
    mi: 'mi',
  }

  it('prints nothing for a document that says nothing', () => {
    expect(warrantyForPrint(EMPTY_WARRANTY, { labels })).toEqual({})
  })

  it("prints the period in the workshop's units", () => {
    const row = { warrantyStatus: 'included', warrantyMonths: 12, warrantyMileage: 20000 }
    expect(warrantyForPrint(row, { labels, unitSystem: 'metric' }).duration).toBe(
      `12 meses / ${(20000).toLocaleString()} km`
    )
    // The limit used to print as km whatever the workshop measured in.
    expect(warrantyForPrint(row, { labels, unitSystem: 'imperial' }).duration).toBe(
      `12 meses / ${(20000).toLocaleString()} mi`
    )
  })

  it('prints a job saved before the statement existed as the warranty it was', () => {
    const printed = warrantyForPrint(
      { warrantyMonths: 6, warrantyNotes: 'Parts only' },
      { labels, unitSystem: 'metric', expires: '18/03/2027' }
    )
    expect(printed).toEqual({
      duration: '6 meses',
      expires: '18/03/2027',
      terms: 'Parts only',
      statement: undefined,
    })
  })

  it("says so in the customer's language when no warranty is included", () => {
    expect(warrantyForPrint({ warrantyStatus: 'not_included' }, { labels })).toEqual({
      statement: 'Garantia da oficina não incluída',
      terms: 'Os seus direitos legais não são afetados.',
    })
  })

  it("prints the workshop's own sentence in place of the stock one", () => {
    const printed = warrantyForPrint(
      { warrantyStatus: 'not_included', warrantyNotes: 'Peças fornecidas pelo cliente.' },
      { labels }
    )
    expect(printed.terms).toBe('Peças fornecidas pelo cliente.')
    expect(printed.duration).toBeUndefined()
  })

  it('never prints a period under "not included", whatever the row holds', () => {
    const printed = warrantyForPrint(
      { warrantyStatus: 'not_included', warrantyMonths: 12, warrantyMileage: 20000 },
      { labels, expires: '18/09/2027' }
    )
    expect(printed.duration).toBeUndefined()
    expect(printed.expires).toBeUndefined()
  })

  it('prints a bare "Included" when that is all the workshop states', () => {
    expect(warrantyForPrint({ warrantyStatus: 'included' }, { labels })).toEqual({
      duration: undefined,
      expires: undefined,
      terms: undefined,
      statement: 'Incluída',
    })
  })

  it('shows no expiry when there is no period to expire', () => {
    const printed = warrantyForPrint(
      { warrantyStatus: 'included', warrantyNotes: 'Lifetime on workmanship.' },
      { labels, expires: '18/09/2027' }
    )
    expect(printed.expires).toBeUndefined()
    expect(printed.statement).toBeUndefined()
  })

  it('falls back to English when a label is missing', () => {
    expect(warrantyForPrint({ warrantyStatus: 'not_included' }, { labels: {} })).toEqual({
      statement: 'No workshop warranty is included',
      terms: 'Your statutory rights are not affected.',
    })
  })
})
