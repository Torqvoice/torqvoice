import { getSettings } from '@/features/settings/Actions/settingsActions'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures } from '@/lib/features'
import { db } from '@/lib/db'
import { channelEnabled } from '@/features/integrations/Lib/messaging'
import {
  getInvoiceLayoutConfig,
  getQuoteLayoutConfig,
} from '@/features/settings/Actions/invoiceLayoutActions'
import { getFieldDefinitions } from '@/features/custom-fields/Actions/customFieldActions'
import { redirect } from 'next/navigation'
import { InvoiceSettings } from './invoice-settings'
import { countUnfrozenInvoices } from '@/features/invoices/Actions/legacyInvoiceActions'

export default async function InvoiceSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  const [result, invoiceLayoutResult, quoteLayoutResult, customFieldsResult] = await Promise.all([
    getSettings(),
    getInvoiceLayoutConfig(),
    getQuoteLayoutConfig(),
    features.customFields ? getFieldDefinitions() : Promise.resolve({ success: true, data: [] }),
  ])

  const settings = result.success && result.data ? result.data : {}
  const unnumberedCustomers = await db.customer.count({
    where: { organizationId: data.organizationId, customerNumber: null },
  })
  const customFields =
    customFieldsResult.success && customFieldsResult.data ? customFieldsResult.data : []
  const unfrozenResult = await countUnfrozenInvoices()
  const unfrozenInvoices = unfrozenResult.success ? (unfrozenResult.data ?? 0) : 0

  // Check if Telegram is enabled (plan feature + the switch on its integration)
  let telegramEnabled = false
  if (features.telegram) {
    telegramEnabled = await channelEnabled(data.organizationId, 'telegram')
  }

  // The preview is meant to look like this workshop's own paper, so it gets the
  // real company details rather than the sample shop's.
  const organization = await db.organization.findUnique({
    where: { id: data.organizationId },
    select: { name: true },
  })

  const workshop = {
    name: organization?.name,
    address: settings['workshop.address'],
    phone: settings['workshop.phone'],
    email: settings['workshop.email'],
    slogan: settings['workshop.slogan'],
  }

  return (
    <InvoiceSettings
      settings={settings}
      workshop={workshop}
      unnumberedCustomers={unnumberedCustomers}
      unfrozenInvoices={unfrozenInvoices}
      initialInvoiceLayout={invoiceLayoutResult.success ? invoiceLayoutResult.data : undefined}
      initialQuoteLayout={quoteLayoutResult.success ? quoteLayoutResult.data : undefined}
      customFields={customFields}
      customFieldsEnabled={features.customFields ?? false}
      telegramEnabled={telegramEnabled}
    />
  )
}
