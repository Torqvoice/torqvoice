import { getQuote } from '@/features/quotes/Actions/quoteActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getLaborPresetsList } from '@/features/labor-presets/Actions/laborPresetActions'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures } from '@/lib/features'
import { PageHeader } from '@/components/page-header'
import { QuotePageClient } from '@/features/quotes/Components/QuotePageClient'

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [result, settingsResult, presetsResult, authContext] = await Promise.all([
    getQuote(id),
    getSettings([
      SETTING_KEYS.CURRENCY_CODE,
      SETTING_KEYS.DEFAULT_TAX_RATE,
      SETTING_KEYS.TAX_ENABLED,
      SETTING_KEYS.DEFAULT_LABOR_RATE,
    ]),
    getLaborPresetsList(),
    getAuthContext(),
  ])

  const orgId = authContext?.organizationId
  const features = orgId ? await getFeatures(orgId) : null

  if (!result.success || !result.data) {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || 'Quote not found'}</p>
        </div>
      </div>
    )
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || 'USD'
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== 'false'
  const defaultTaxRate = taxEnabled ? Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0 : 0
  const defaultLaborRate = Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0
  const laborPresets = presetsResult.success && presetsResult.data ? presetsResult.data : []
  const organizationId = authContext?.organizationId || ''

  // Separate attachments by category
  const allAttachments = result.data.attachments || []
  const imageAttachments = allAttachments.filter(
    (a: { category: string }) => a.category === 'image'
  )
  const documentAttachments = allAttachments.filter(
    (a: { category: string }) => a.category === 'document'
  )
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <QuotePageClient
        quote={result.data}
        organizationId={organizationId}
        imageAttachments={imageAttachments}
        documentAttachments={documentAttachments}
        maxImages={features?.maxImagesPerService}
        maxDocuments={features?.maxDocumentsPerService}
        currencyCode={currencyCode}
        defaultTaxRate={defaultTaxRate}
        taxEnabled={taxEnabled}
        defaultLaborRate={defaultLaborRate}
        laborPresets={laborPresets}
        smsEnabled={features?.sms ?? false}
        emailEnabled={features?.smtp ?? false}
      />
    </div>
  )
}
