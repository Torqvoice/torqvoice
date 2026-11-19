import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import { getPortalQuote } from '@/features/portal/Actions/getPortalQuote'
import {
  PortalDetailLayout,
  type PortalFact,
  PortalFacts,
  PortalLoadFailed,
  PortalPageHead,
  PortalStatus,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalQuoteAnswer } from '@/features/portal/Components/Detail/PortalQuoteAnswer'
import { PortalSheetScroll } from '@/features/portal/Components/Detail/PortalSheetScroll'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { PortalPanel, PortalSectionLabel } from '@/features/portal/Components/Ui'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { quoteStatusLabel } from '@/features/quotes/Lib/quoteStatus'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('portal.quoteDetail', 'title')
}

/**
 * A quote read in the portal, the way an invoice can be: the sheet the shared
 * page and the PDF print, for the signed-in customer's own sent quotes only,
 * with what it comes to and the answer beside it on a desk and above it on a
 * phone.
 *
 * While the quote waits for an answer the customer gives it here, as the one
 * signed in: accept, or ask for changes. No share link is needed for that.
 */
export default async function PortalQuotePage({
  params,
}: {
  params: Promise<{ orgId: string; quoteId: string }>
}) {
  const { orgId, quoteId } = await params
  const t = await getTranslations('portal.quoteDetail')
  const tStatus = await getTranslations('quotes.statusLabels')
  const result = await getPortalQuote(quoteId)
  const back = { href: `/portal/${orgId}/quotes`, label: t('back') }

  if (!result.success) {
    return (
      <PortalShell orgId={orgId}>
        <PortalPageHead title={t('title')} back={back} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }
  if (!result.data) notFound()
  const quote = result.data

  const org = await resolvePortalOrg(orgId)
  if (!org) notFound()
  const fmt = await portalFormat(org.id)

  const facts: PortalFact[] = [
    ...(quote.quoteNumber ? [{ label: t('number'), value: quote.quoteNumber }] : []),
    ...(quote.customerReference
      ? [{ label: t('reference'), value: quote.customerReference }]
      : []),
    { label: t('date'), value: fmt.day(quote.createdAt) },
    ...(quote.validUntil ? [{ label: t('validUntil'), value: fmt.day(quote.validUntil) }] : []),
    ...(quote.vehicle
      ? [
          {
            label: t('vehicle'),
            value: [quote.vehicle.year, quote.vehicle.make, quote.vehicle.model]
              .filter(Boolean)
              .join(' '),
          },
        ]
      : []),
  ]

  return (
    <PortalShell orgId={orgId}>
      <PortalPageHead
        back={back}
        title={quote.title}
        badge={
          <PortalStatus kind="quote" status={quote.status}>
            {quoteStatusLabel(quote.status, tStatus)}
          </PortalStatus>
        }
      />

      <PortalDetailLayout
        aside={
          <>
            <PortalPanel aria-labelledby="quote-summary">
              <PortalSectionLabel id="quote-summary">{t('total')}</PortalSectionLabel>
              <p className="p-display mt-1.5 text-[36px]">{fmt.money(quote.totalAmount)}</p>
              <div className="mt-3">
                <PortalFacts facts={facts} />
              </div>
            </PortalPanel>
            <PortalQuoteAnswer
              quoteId={quote.id}
              status={quote.status}
              awaitsAnswer={quote.awaitsAnswer}
            />
          </>
        }
      >
        <PortalSheetScroll label={t('fullQuote')}>
          <SpecSheet spec={quote.spec} />
        </PortalSheetScroll>
      </PortalDetailLayout>
    </PortalShell>
  )
}
