import { ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPortalQuotes } from '@/features/portal/Actions/portalActions'
import {
  PortalCard,
  PortalCardList,
  PortalListLayout,
  PortalLoadFailed,
  PortalPageHead,
  PortalStatus,
  PortalStretchLink,
  PortalTable,
  PortalTd,
  PortalTh,
  PortalTr,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalDocumentsTabs } from '@/features/portal/Components/PortalDocumentsTabs'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import {
  PortalEmptyState,
  PortalLinkButton,
  PortalPanel,
  PortalSectionLabel,
} from '@/features/portal/Components/Ui'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { quoteStatusLabel } from '@/features/quotes/Lib/quoteStatus'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('portal.quotes', 'title')
}

export default async function PortalQuotesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tQuoteStatus, fmt, result] = await Promise.all([
    getTranslations('portal.quotes'),
    getTranslations('quotes.statusLabels'),
    portalFormat(org.id),
    getPortalQuotes(),
  ])

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <PortalDocumentsTabs orgId={orgId} active="quotes" />
        <PortalPageHead title={t('title')} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }

  const day = (at: Date | string) => fmt.day(new Date(at).toISOString())
  // A shared quote opens where the customer can answer it; one without a
  // link opens in the portal.
  const rows = result.data.map((q) => ({
    q,
    label: q.quoteNumber ? `#${q.quoteNumber} · ${q.title}` : q.title,
    href: q.publicToken
      ? `/share/quote/${orgId}/${q.publicToken}`
      : `/portal/${orgId}/quotes/${q.id}`,
  }))

  // Sent, not answered and not past its last valid day: the ones to act on.
  const waiting = rows.filter(
    ({ q }) =>
      q.status === 'sent' && !(q.validUntil && fmt.isPast(new Date(q.validUntil).toISOString()))
  )

  return (
    <PortalShell orgId={orgId}>
      <PortalDocumentsTabs orgId={orgId} active="quotes" />
      <PortalPageHead title={t('title')} description={t('description')} />

      {rows.length === 0 ? (
        <PortalPanel>
          <PortalEmptyState center title={t('noQuotes')}>
            {t('noQuotesHint')}
          </PortalEmptyState>
        </PortalPanel>
      ) : (
        <PortalListLayout
          aside={
            <PortalPanel aria-labelledby="quotes-waiting">
              <PortalSectionLabel id="quotes-waiting">{t('waitingTitle')}</PortalSectionLabel>
              {waiting.length === 0 ? (
                <p className="p-muted mt-2 text-[15px]">{t('waitingNone')}</p>
              ) : (
                <ul className="mt-2 flex flex-col">
                  {waiting.map(({ q, label, href }) => (
                    <li key={q.id} className="border-b py-3.5 last:border-b-0 last:pb-0">
                      <p className="break-words text-base font-semibold">{label}</p>
                      <p className="p-muted text-sm">
                        {fmt.money(q.totalAmount)}
                        {q.validUntil && (
                          <> &middot; {t('validUntilDate', { date: day(q.validUntil) })}</>
                        )}
                      </p>
                      <PortalLinkButton variant="accent" block className="mt-3" href={href}>
                        {t('waitingAnswer')}
                      </PortalLinkButton>
                    </li>
                  ))}
                </ul>
              )}
            </PortalPanel>
          }
        >
          {/* Cards on a phone: the whole card is the link. */}
          <PortalCardList>
            {rows.map(({ q, label, href }) => (
              <PortalCard key={q.id}>
                <div className="flex items-start justify-between gap-3">
                  <PortalStretchLink href={href} className="min-w-0 flex-1 break-words text-[17px]">
                    {label}
                  </PortalStretchLink>
                  <span className="shrink-0 text-[17px] font-bold">{fmt.money(q.totalAmount)}</span>
                </div>
                <div className="p-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <PortalStatus kind="quote" status={q.status}>
                    {quoteStatusLabel(q.status, tQuoteStatus)}
                  </PortalStatus>
                  {q.vehicle && (
                    <span className="break-words">
                      {q.vehicle.make} {q.vehicle.model}
                    </span>
                  )}
                  {q.validUntil && <span>{t('validUntilDate', { date: day(q.validUntil) })}</span>}
                </div>
              </PortalCard>
            ))}
          </PortalCardList>

          {/* A table on a desk: the row is the link. */}
          <PortalTable>
            <thead>
              <tr>
                <PortalTh>{t('quote')}</PortalTh>
                <PortalTh>{t('vehicle')}</PortalTh>
                <PortalTh>{t('status')}</PortalTh>
                <PortalTh align="right">{t('amount')}</PortalTh>
                <PortalTh>{t('validUntil')}</PortalTh>
                <PortalTh className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ q, label, href }) => (
                <PortalTr key={q.id}>
                  <PortalTd>
                    <PortalStretchLink href={href}>{label}</PortalStretchLink>
                  </PortalTd>
                  <PortalTd muted>
                    {q.vehicle ? `${q.vehicle.make} ${q.vehicle.model}` : ''}
                  </PortalTd>
                  <PortalTd>
                    <PortalStatus kind="quote" status={q.status}>
                      {quoteStatusLabel(q.status, tQuoteStatus)}
                    </PortalStatus>
                  </PortalTd>
                  <PortalTd align="right" className="font-semibold">
                    {fmt.money(q.totalAmount)}
                  </PortalTd>
                  <PortalTd muted>{q.validUntil ? day(q.validUntil) : ''}</PortalTd>
                  <PortalTd>
                    <ChevronRight className="p-muted h-[18px] w-[18px]" aria-hidden />
                  </PortalTd>
                </PortalTr>
              ))}
            </tbody>
          </PortalTable>
        </PortalListLayout>
      )}
    </PortalShell>
  )
}
