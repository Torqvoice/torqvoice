/**
 * Which logo a document prints.
 *
 * A workshop's paperwork does not always want the badge the app wears, so a
 * document may carry its own. The failure this guards is the one that started
 * it: uploading a letterhead in the designer and finding the logo in the
 * sidebar had changed too.
 */

import { describe, expect, it } from 'vitest'
import { documentLogoPath } from '@/features/invoice-designer/Lib/documentLogo'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const COMPANY = '/uploads/company.png'
const INVOICE = '/uploads/invoice.png'
const QUOTE = '/uploads/quote.png'

describe('resolving a document logo', () => {
  it('falls back to the company logo when the document has none', () => {
    const settings = { [SETTING_KEYS.COMPANY_LOGO]: COMPANY }
    expect(documentLogoPath(settings, 'invoice')).toBe(COMPANY)
    expect(documentLogoPath(settings, 'quote')).toBe(COMPANY)
  })

  it('prefers the document’s own mark when it has one', () => {
    expect(
      documentLogoPath(
        { [SETTING_KEYS.COMPANY_LOGO]: COMPANY, [SETTING_KEYS.INVOICE_LOGO]: INVOICE },
        'invoice'
      )
    ).toBe(INVOICE)
  })

  it('keeps invoices and quotes apart', () => {
    // Everything else about their appearance already is separate.
    const settings = {
      [SETTING_KEYS.COMPANY_LOGO]: COMPANY,
      [SETTING_KEYS.INVOICE_LOGO]: INVOICE,
      [SETTING_KEYS.QUOTE_LOGO]: QUOTE,
    }
    expect(documentLogoPath(settings, 'invoice')).toBe(INVOICE)
    expect(documentLogoPath(settings, 'quote')).toBe(QUOTE)
  })

  it('does not let one document’s mark leak onto the other', () => {
    const settings = {
      [SETTING_KEYS.COMPANY_LOGO]: COMPANY,
      [SETTING_KEYS.INVOICE_LOGO]: INVOICE,
    }
    expect(documentLogoPath(settings, 'quote')).toBe(COMPANY)
  })

  it('treats a blank or whitespace value as unset', () => {
    // A cleared field stores an empty string rather than removing the row, and
    // an empty logo path would print nothing at all instead of falling back.
    expect(
      documentLogoPath(
        { [SETTING_KEYS.COMPANY_LOGO]: COMPANY, [SETTING_KEYS.INVOICE_LOGO]: '  ' },
        'invoice'
      )
    ).toBe(COMPANY)
  })

  it('returns nothing when neither exists, rather than a broken path', () => {
    expect(documentLogoPath({}, 'invoice')).toBe('')
    expect(documentLogoPath({ [SETTING_KEYS.COMPANY_LOGO]: null }, 'quote')).toBe('')
  })
})
