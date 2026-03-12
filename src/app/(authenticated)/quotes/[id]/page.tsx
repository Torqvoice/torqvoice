import { getQuote } from '@/features/quotes/Actions/quoteActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures } from '@/lib/features'
import { db } from '@/lib/db'
import { PageHeader } from '@/components/page-header'
import { QuotePageClient } from '@/features/quotes/Components/QuotePageClient'

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [result, settingsResult, authContext] = await Promise.all([
    getQuote(id),
    getSettings([
      SETTING_KEYS.CURRENCY_CODE,
      SETTING_KEYS.DEFAULT_TAX_RATE,
      SETTING_KEYS.TAX_ENABLED,
      SETTING_KEYS.DEFAULT_LABOR_RATE,
    ]),
    getAuthContext(),
  ])

  const orgId = authContext?.organizationId
  const [features, aiSettings] = await Promise.all([
    orgId ? getFeatures(orgId) : Promise.resolve(null),
    orgId
      ? db.appSetting.findMany({
          where: {
            organizationId: orgId,
            key: { in: [SETTING_KEYS.AI_ENABLED, SETTING_KEYS.AI_API_KEY] },
          },
          select: { key: true, value: true },
        })
      : Promise.resolve([]),
  ])
  const aiMap = Object.fromEntries(aiSettings.map((s) => [s.key, s.value]))
  const aiEnabled =
    features?.ai === true &&
    aiMap[SETTING_KEYS.AI_ENABLED] === 'true' &&
    !!aiMap[SETTING_KEYS.AI_API_KEY]

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
        smsEnabled={features?.sms ?? false}
        emailEnabled={features?.smtp ?? false}
        aiEnabled={aiEnabled}
      />
    </div>
  )
}
