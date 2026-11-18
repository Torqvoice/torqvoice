import 'server-only'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { resolveDocumentLocale } from '@/i18n/locale-from-request'
import { SMS_TEMPLATE_DEFAULTS } from '@/lib/sms-templates'

/** Where each SMS template's default wording lives in settings.json. */
const DEFAULT_KEYS: Record<string, string> = {
  [SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY]: 'invoiceReady',
  [SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY]: 'quoteReady',
  [SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]: 'inspectionReady',
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS]: 'statusInProgress',
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS]: 'statusWaitingParts',
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_READY]: 'statusReady',
  [SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED]: 'statusCompleted',
  [SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED]: 'paymentReceived',
}

/**
 * The default SMS wording for a workshop that has not written its own, in the
 * workshop's language: the language its customers get their invoices in.
 *
 * Settings → Templates always showed these translated, but the text that was
 * sent fell back to the English constants, so a Norwegian workshop that never
 * touched its templates texted its customers in English. Read raw from the
 * messages file because the wording holds `{share_link}` and friends, which
 * the app fills in itself rather than through next-intl.
 */
export async function smsTemplateDefaults(organizationId: string): Promise<Record<string, string>> {
  const locale = await resolveDocumentLocale(organizationId)
  const messages = (await import(`../../../../messages/${locale}/settings.json`)).default as {
    templates?: { smsDefaults?: Record<string, string> }
  }
  const translated = messages.templates?.smsDefaults ?? {}

  const defaults: Record<string, string> = {}
  for (const [key, defaultKey] of Object.entries(DEFAULT_KEYS)) {
    defaults[key] = translated[defaultKey] || SMS_TEMPLATE_DEFAULTS[key] || ''
  }
  return defaults
}
