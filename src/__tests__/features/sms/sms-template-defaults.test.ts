/**
 * A workshop that never wrote its own SMS wording texts its customers in the
 * workshop's language, the same wording Settings → Templates shows, and the
 * invoice text signs off on its own line.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let workshopLocale = 'nb'
vi.mock('@/i18n/locale-from-request', () => ({
  resolveDocumentLocale: async () => workshopLocale,
}))

const { smsTemplateDefaults } = await import('@/features/sms/Lib/smsTemplateDefaults.server')
const { interpolateSmsTemplate } = await import('@/lib/sms-templates')
const { SETTING_KEYS } = await import('@/features/settings/Schema/settingsSchema')

const INVOICE = SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY
const values = {
  company_name: 'Egeland Auto',
  share_link: 'https://app.test/share/invoice/1',
  current_user: 'Bernt Christian Egeland',
}

beforeEach(() => {
  workshopLocale = 'nb'
})

describe('the default SMS wording', () => {
  it('is in the workshop’s language, with the sign-off on its own line', async () => {
    const defaults = await smsTemplateDefaults('org')

    expect(interpolateSmsTemplate(defaults[INVOICE], values)).toBe(
      'Faktura fra Egeland Auto er klar. Se den her: https://app.test/share/invoice/1\n' +
        'Mvh Egeland Auto - Bernt Christian Egeland'
    )
  })

  it('follows the workshop when it reads English', async () => {
    workshopLocale = 'en'

    const defaults = await smsTemplateDefaults('org')

    expect(interpolateSmsTemplate(defaults[INVOICE], values)).toBe(
      'Invoice from Egeland Auto is ready. View it here: https://app.test/share/invoice/1\n' +
        'Regards Egeland Auto - Bernt Christian Egeland'
    )
  })

  it('has every template, in every language the app speaks', async () => {
    for (const locale of ['de', 'es', 'fr', 'it', 'lt', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ru', 'tr']) {
      workshopLocale = locale
      const defaults = await smsTemplateDefaults('org')

      expect(Object.keys(defaults)).toHaveLength(8)
      expect(defaults[INVOICE]).toContain('{share_link}')
      expect(defaults[INVOICE]).toContain('\n')
    }
  })
})
