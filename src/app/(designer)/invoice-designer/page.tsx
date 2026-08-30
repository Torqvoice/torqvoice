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
import { InvoiceDesigner } from '@/features/invoice-designer/Components/InvoiceDesigner'

export default async function InvoiceDesignerPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; view?: string }>
}) {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  // The designer is the whole of the custom-templates feature now, so the same
  // gate the settings page used applies here.
  if (!features.customTemplates) redirect('/settings/templates')

  const [settingsResult, invoiceLayout, quoteLayout, organization] = await Promise.all([
    getSettings(),
    getInvoiceLayoutConfig(),
    getQuoteLayoutConfig(),
    db.organization.findUnique({
      where: { id: data.organizationId },
      select: { name: true },
    }),
  ])

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const { doc, view } = await searchParams

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
    fontFamily: settings[`${prefix}.fontFamily`] || 'Helvetica',
    headerStyle: settings[`${prefix}.headerStyle`] || 'standard',
    logoSize: Number(settings[`${prefix}.logoSize`]) || 100,
  })

  return (
    <InvoiceDesigner
      initialDocumentType={doc === 'quote' ? 'quote' : 'invoice'}
      initialView={view === 'designer' ? 'designer' : 'gallery'}
      invoiceLayout={invoiceLayout.success ? invoiceLayout.data : undefined}
      quoteLayout={quoteLayout.success ? quoteLayout.data : undefined}
      invoiceTemplate={templateFor('invoice')}
      quoteTemplate={templateFor('quote')}
      workshop={{
        name: organization?.name ?? '',
        address: settings[SETTING_KEYS.WORKSHOP_ADDRESS] ?? '',
        phone: settings[SETTING_KEYS.WORKSHOP_PHONE] ?? '',
        email: settings[SETTING_KEYS.WORKSHOP_EMAIL] ?? '',
        slogan: settings[SETTING_KEYS.WORKSHOP_SLOGAN] ?? '',
        orgNumber: settings[SETTING_KEYS.INVOICE_ORG_NUMBER] ?? '',
        logoUrl: settings[SETTING_KEYS.COMPANY_LOGO] ?? '',
      }}
    />
  )
}
