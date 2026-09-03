import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures } from '@/lib/features'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  getInvoiceLayoutConfig,
  getQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'
import { getFieldDefinitions } from '@/features/custom-fields/Actions/customFieldActions'
import { listDocumentDesigns } from '@/features/invoice-designer/Actions/documentDesignActions'
import { InvoiceDesigner } from '@/features/invoice-designer/Components/InvoiceDesigner'
import { DismissOnArrival } from '@/components/feature-hint'
import { INVOICE_DESIGNER_ANNOUNCEMENT, parseHintIds } from '@/features/settings/Lib/featureHints'
import type { SavedDesign } from '@/features/invoice-designer/Components/types'

export default async function InvoiceDesignerPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; view?: string; preset?: string; design?: string }>
}) {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  // The designer is the whole of the custom-templates feature now, so the same
  // gate the settings page used applies here.
  if (!features.customTemplates) redirect('/settings/templates')

  const [
    settingsResult,
    invoiceLayout,
    quoteLayout,
    organization,
    customFieldsResult,
    seenRow,
    invoiceDesigns,
    quoteDesigns,
  ] = await Promise.all([
    getSettings(),
    getInvoiceLayoutConfig(),
    getQuoteLayoutConfig(),
    db.organization.findUnique({
      where: { id: data.organizationId },
      select: { name: true },
    }),
    features.customFields ? getFieldDefinitions() : Promise.resolve({ success: true, data: [] }),
    db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: data.organizationId,
          key: SETTING_KEYS.FEATURE_HINTS_SEEN,
        },
      },
      select: { value: true },
    }),
    listDocumentDesigns('invoice'),
    listDocumentDesigns('quote'),
  ])

  // Somebody is looking at the designer, so the workshop knows it exists. Only
  // written when the card is still outstanding, to keep a settled announcement
  // from costing a write on every visit.
  const announcementLive = !parseHintIds(seenRow?.value).includes(INVOICE_DESIGNER_ANNOUNCEMENT)

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}

  // One gallery for both documents, as before: a design saved on the quote
  // canvas is as much a starting point for the invoice as the other way
  // round. Invoice designs first, because that is what most of them are.
  const savedDesigns: SavedDesign[] = [
    ...(invoiceDesigns.success && invoiceDesigns.data ? invoiceDesigns.data : []),
    ...(quoteDesigns.success && quoteDesigns.data ? quoteDesigns.data : []),
  ]
  const { doc, view, preset, design } = await searchParams

  const templateFor = (prefix: 'invoice' | 'quote') => ({
    primaryColor:
      settings[`${prefix}.primaryColor`] ||
      settings[SETTING_KEYS.INVOICE_PRIMARY_COLOR] ||
      '#d97706',
    backgroundColor: settings[`${prefix}.backgroundColor`] || '',
    textColor: settings[`${prefix}.textColor`] || '',
    companyTextColor: settings[`${prefix}.companyTextColor`] || '',
    frameBorderColor: settings[`${prefix}.frameBorderColor`] || '',
    frameShadow: settings[`${prefix}.frameShadow`] || 'true',
    frameSide: settings[`${prefix}.frameSide`] || 'left',
    frameRadius: Number(settings[`${prefix}.frameRadius`]) || 0,
    fontFamily: settings[`${prefix}.fontFamily`] || 'Helvetica',
    headerStyle: settings[`${prefix}.headerStyle`] || 'standard',
    logoSize: Number(settings[`${prefix}.logoSize`]) || 100,
    logoUrl: settings[`${prefix}.logo`] || '',
  })

  return (
    <>
      {announcementLive && <DismissOnArrival id={INVOICE_DESIGNER_ANNOUNCEMENT} />}
      <InvoiceDesigner
        initialDocumentType={doc === 'quote' ? 'quote' : 'invoice'}
        initialView={view === 'designer' ? 'designer' : 'gallery'}
        initialPresetId={preset}
        initialDesignId={design}
        initialActiveDesigns={{
          invoice: settings['invoice.activeDesign'] || '',
          quote: settings['quote.activeDesign'] || '',
        }}
        invoiceLayout={invoiceLayout.success ? invoiceLayout.data : undefined}
        quoteLayout={quoteLayout.success ? quoteLayout.data : undefined}
        invoiceTemplate={templateFor('invoice')}
        quoteTemplate={templateFor('quote')}
        initialSavedDesigns={savedDesigns}
        workshop={{
          name: organization?.name || '',
          address: settings[SETTING_KEYS.WORKSHOP_ADDRESS] || '',
          phone: settings[SETTING_KEYS.WORKSHOP_PHONE] || '',
          email: settings[SETTING_KEYS.WORKSHOP_EMAIL] || '',
          slogan: settings[SETTING_KEYS.WORKSHOP_SLOGAN] || '',
          orgNumber: settings[SETTING_KEYS.INVOICE_ORG_NUMBER] || '',
          paymentTerms: settings[SETTING_KEYS.INVOICE_PAYMENT_TERMS] || '',
          logoUrl: settings[SETTING_KEYS.COMPANY_LOGO] || '',
        }}
        customFields={
          customFieldsResult.success && customFieldsResult.data
            ? customFieldsResult.data
                .filter((f) => f.entityType === 'service_record')
                .map((f) => ({ id: f.id, label: f.label, name: f.name, isActive: f.isActive }))
            : []
        }
        quoteCustomFields={
          customFieldsResult.success && customFieldsResult.data
            ? customFieldsResult.data
                .filter((f) => f.entityType === 'quote')
                .map((f) => ({ id: f.id, label: f.label, name: f.name, isActive: f.isActive }))
            : []
        }
      />
    </>
  )
}
