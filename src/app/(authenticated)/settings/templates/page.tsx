import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { TemplateSettings } from './template-settings'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { FeatureLockedMessage } from '../feature-locked-message'
import { redirect } from 'next/navigation'
import { getTemplates } from '@/features/inspections/Actions/templateActions'
import { db } from '@/lib/db'
import { getTranslations } from 'next-intl/server'
import {
  getInvoiceLayoutConfig,
  getQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'
export default async function TemplatePage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  if (!features.customTemplates) {
    return (
      <FeatureLockedMessage
        feature="Templates"
        description="Choose from pre-built templates and customize colors, fonts, and header layouts for your PDF invoices and quotes."
        isCloud={isCloudMode()}
      />
    )
  }

  const [result, inspectionTemplatesResult, invoiceLayoutResult, quoteLayoutResult, organization] =
    await Promise.all([
      getSettings([
        SETTING_KEYS.INVOICE_PRIMARY_COLOR,
        SETTING_KEYS.INVOICE_BACKGROUND_COLOR,
        SETTING_KEYS.INVOICE_TEXT_COLOR,
        SETTING_KEYS.INVOICE_FRAME_BORDER_COLOR,
        SETTING_KEYS.INVOICE_FRAME_SHADOW,
        SETTING_KEYS.INVOICE_FONT_FAMILY,
        SETTING_KEYS.INVOICE_HEADER_STYLE,
        SETTING_KEYS.INVOICE_LOGO_SIZE,
        SETTING_KEYS.QUOTE_PRIMARY_COLOR,
        SETTING_KEYS.QUOTE_BACKGROUND_COLOR,
        SETTING_KEYS.QUOTE_TEXT_COLOR,
        SETTING_KEYS.QUOTE_FRAME_BORDER_COLOR,
        SETTING_KEYS.QUOTE_FRAME_SHADOW,
        SETTING_KEYS.QUOTE_FONT_FAMILY,
        SETTING_KEYS.QUOTE_HEADER_STYLE,
        SETTING_KEYS.QUOTE_LOGO_SIZE,
        SETTING_KEYS.COMPANY_LOGO,
        SETTING_KEYS.WORKSHOP_ADDRESS,
        SETTING_KEYS.WORKSHOP_SLOGAN,
        SETTING_KEYS.WORKSHOP_PHONE,
        SETTING_KEYS.WORKSHOP_EMAIL,
        SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
        SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY,
        SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
        SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED,
      ]),
      getTemplates(),
      getInvoiceLayoutConfig(),
      getQuoteLayoutConfig(),
      // Read straight off the organization, the way the real PDF does. Going
      // through the membership list would miss anyone viewing a workshop they
      // are not a member of.
      db.organization.findUnique({
        where: { id: data.organizationId },
        select: { name: true },
      }),
    ])

  const settings = result.success && result.data ? result.data : {}
  const inspectionTemplates =
    inspectionTemplatesResult.success && inspectionTemplatesResult.data
      ? inspectionTemplatesResult.data
      : []

  const t = await getTranslations('settings')

  // The preview is meant to look like this workshop's own paper, so it gets the
  // real company details rather than the sample shop's.
  const workshop = {
    name: organization?.name,
    address: settings[SETTING_KEYS.WORKSHOP_ADDRESS],
    phone: settings[SETTING_KEYS.WORKSHOP_PHONE],
    email: settings[SETTING_KEYS.WORKSHOP_EMAIL],
    slogan: settings[SETTING_KEYS.WORKSHOP_SLOGAN],
  }

  const smsDefaultMap: Record<string, string> = {
    [SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY]: t.raw('templates.smsDefaults.invoiceReady'),
    [SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY]: t.raw('templates.smsDefaults.quoteReady'),
    [SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY]: t.raw('templates.smsDefaults.inspectionReady'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS]: t.raw('templates.smsDefaults.statusInProgress'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS]: t.raw(
      'templates.smsDefaults.statusWaitingParts'
    ),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_READY]: t.raw('templates.smsDefaults.statusReady'),
    [SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED]: t.raw('templates.smsDefaults.statusCompleted'),
    [SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED]: t.raw('templates.smsDefaults.paymentReceived'),
  }

  const smsTemplates: Record<string, string> = {}
  for (const key of Object.keys(smsDefaultMap)) {
    smsTemplates[key] = settings[key] || smsDefaultMap[key] || ''
  }

  return (
    <TemplateSettings
      initialInvoiceValues={{
        primaryColor: settings[SETTING_KEYS.INVOICE_PRIMARY_COLOR] || '#d97706',
        backgroundColor: settings[SETTING_KEYS.INVOICE_BACKGROUND_COLOR] || '',
        textColor: settings[SETTING_KEYS.INVOICE_TEXT_COLOR] || '',
        frameBorderColor: settings[SETTING_KEYS.INVOICE_FRAME_BORDER_COLOR] || '',
        frameShadow: settings[SETTING_KEYS.INVOICE_FRAME_SHADOW] || 'true',
        fontFamily: settings[SETTING_KEYS.INVOICE_FONT_FAMILY] || 'Helvetica',
        headerStyle: settings[SETTING_KEYS.INVOICE_HEADER_STYLE] || 'standard',
        logoSize: Number(settings[SETTING_KEYS.INVOICE_LOGO_SIZE]) || 100,
      }}
      initialQuoteValues={{
        primaryColor: settings[SETTING_KEYS.QUOTE_PRIMARY_COLOR] || '#d97706',
        backgroundColor: settings[SETTING_KEYS.QUOTE_BACKGROUND_COLOR] || '',
        textColor: settings[SETTING_KEYS.QUOTE_TEXT_COLOR] || '',
        frameBorderColor: settings[SETTING_KEYS.QUOTE_FRAME_BORDER_COLOR] || '',
        frameShadow: settings[SETTING_KEYS.QUOTE_FRAME_SHADOW] || 'true',
        fontFamily: settings[SETTING_KEYS.QUOTE_FONT_FAMILY] || 'Helvetica',
        headerStyle: settings[SETTING_KEYS.QUOTE_HEADER_STYLE] || 'standard',
        logoSize: Number(settings[SETTING_KEYS.QUOTE_LOGO_SIZE]) || 100,
      }}
      inspectionTemplates={inspectionTemplates}
      smsEnabled={features.sms ?? false}
      initialSmsTemplates={smsTemplates}
      logoUrl={settings[SETTING_KEYS.COMPANY_LOGO] || undefined}
      workshop={workshop}
      invoiceLayoutConfig={invoiceLayoutResult.success ? invoiceLayoutResult.data : undefined}
      quoteLayoutConfig={quoteLayoutResult.success ? quoteLayoutResult.data : undefined}
    />
  )
}
