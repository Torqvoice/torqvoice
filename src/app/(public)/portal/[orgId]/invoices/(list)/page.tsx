import { Download } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPortalInvoices } from '@/features/portal/Actions/portalActions'
import { offeredPaymentProviders } from '@/features/integrations/Lib/payments'
import {
  PortalCard,
  PortalCardList,
  PortalListLayout,
  PortalLoadFailed,
  PortalPageHead,
  PortalPaymentBadge,
  type PortalPaymentMark,
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
import { portalPayment } from '@/features/portal/Lib/paymentState'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('portal.invoices', 'title')
}

export default async function PortalInvoicesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tHome, fmt, result] = await Promise.all([
    getTranslations('portal.invoices'),
    getTranslations('portal.home'),
    portalFormat(org.id),
    getPortalInvoices(),
  ])

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <PortalDocumentsTabs orgId={orgId} active="invoices" />
        <PortalPageHead title={t('title')} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }

  const invoices = result.data
  const day = (at: Date | string) => fmt.day(new Date(at).toISOString())

  const rows = invoices.map((inv) => {
    const payment = portalPayment(inv)
    const due = payment.balance > 0 ? inv.invoiceDueDate : null
    // Past its due day on the workshop's calendar: said in the home's own words.
    const overdue = due ? fmt.isPast(new Date(due).toISOString()) : false
    return {
      inv,
      payment,
      // The badge: overdue is its own state, louder than unpaid.
      mark: (due && overdue ? 'overdue' : payment.state) as PortalPaymentMark,
      due: due ? new Date(due) : null,
      label: inv.invoiceNumber ? t('invoiceNumber', { number: inv.invoiceNumber }) : inv.title,
      href: `/portal/${orgId}/invoices/${inv.id}`,
      // The date printed on the invoice, when it has one of its own.
      date: day(inv.invoiceDate ?? inv.startDateTime ?? inv.serviceDate),
      // What a customer needs from an open bill: how much is left and by when.
      owing: [
        payment.state === 'partial' ? t('leftToPay', { amount: fmt.money(payment.balance) }) : null,
        due && !overdue ? t('dueOn', { date: day(due) }) : null,
      ].filter(Boolean) as string[],
      overdue: due && overdue ? tHome('overdueSince', { day: day(due) }) : null,
    }
  })

  // A status, never a button: see PortalPaymentBadge.
  const paymentBadge = (mark: PortalPaymentMark) => (
    <PortalPaymentBadge state={mark}>{t(mark)}</PortalPaymentBadge>
  )

  // What the customer owes in all, and the invoice to deal with first: an
  // overdue one before any other, then the one due soonest.
  const owing = rows.filter((row) => row.payment.balance > 0)
  const leftToPay = owing.reduce((sum, row) => sum + row.payment.balance, 0)
  const first = [...owing].sort((a, b) => {
    if (!a.due || !b.due) return a.due ? -1 : b.due ? 1 : 0
    return a.due.getTime() - b.due.getTime()
  })[0]
  // Paying online lives on the invoice's own page; only promised when it can be done there.
  const canPay =
    first?.inv.publicToken != null &&
    (await offeredPaymentProviders(org.id).catch(() => [])).length > 0

  const download = (id: string, label: string) => (
    <a
      href={`/portal/${orgId}/invoices/${id}/pdf`}
      download
      className="p-link p-link--block relative z-10 gap-1.5 text-sm"
    >
      <Download className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </a>
  )

  return (
    <PortalShell orgId={orgId}>
      <PortalDocumentsTabs orgId={orgId} active="invoices" />
      <PortalPageHead title={t('title')} description={t('description')} />

      {invoices.length === 0 ? (
        <PortalPanel>
          <PortalEmptyState center title={t('noInvoices')}>
            {t('noInvoicesHint')}
          </PortalEmptyState>
        </PortalPanel>
      ) : (
        <PortalListLayout
          aside={
            <PortalPanel aria-labelledby="invoices-to-pay">
              {first ? (
                <>
                  <PortalSectionLabel id="invoices-to-pay">{t('toPayTitle')}</PortalSectionLabel>
                  <p className="p-display mt-1.5 text-[36px]">{fmt.money(leftToPay)}</p>
                  <p className="p-muted mt-1 text-[15px]">
                    {t('toPayCount', { count: owing.length })}
                    {first.due && !first.overdue && (
                      <> &middot; {t('toPayNextDue', { date: day(first.due) })}</>
                    )}
                  </p>
                  {first.overdue && (
                    <p className="mt-2 text-[15px] font-semibold text-[color:var(--p-danger)]">
                      {first.overdue}
                    </p>
                  )}
                  <PortalLinkButton
                    variant={canPay ? 'accent' : 'strong'}
                    block
                    className="mt-4"
                    href={first.href}
                  >
                    {t(canPay ? 'toPayOpen' : 'toPayOpenNoPay', { invoice: first.label })}
                  </PortalLinkButton>
                </>
              ) : (
                <>
                  <PortalSectionLabel id="invoices-to-pay">{t('nothingToPay')}</PortalSectionLabel>
                  <p className="p-muted mt-2 text-[15px]">{t('nothingToPayBody')}</p>
                </>
              )}
            </PortalPanel>
          }
        >
          {/* Cards on a phone. The whole card opens the invoice: one real link
              stretched over it, with the download lifted above the stretch so
              it stays its own target. */}
          <PortalCardList>
            {rows.map(({ inv, mark, label, href, date, owing, overdue }) => (
              <PortalCard key={inv.id}>
                <div className="flex items-start justify-between gap-3">
                  <PortalStretchLink href={href} className="min-w-0 flex-1 break-words text-[17px]">
                    {label}
                  </PortalStretchLink>
                  <span className="shrink-0 text-[17px] font-bold">
                    {fmt.money(inv.totalAmount)}
                  </span>
                </div>
                <div className="p-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  {paymentBadge(mark)}
                  {inv.vehicle && (
                    <span className="break-words">
                      {inv.vehicle.make} {inv.vehicle.model}
                    </span>
                  )}
                  <span>{date}</span>
                </div>
                {owing.length > 0 && (
                  <p className="mt-2 text-[15px] font-semibold">{owing.join(' · ')}</p>
                )}
                {overdue && (
                  <p className="mt-2 text-[15px] font-semibold text-[color:var(--p-danger)]">
                    {overdue}
                  </p>
                )}
                <div className="mt-1">{download(inv.id, t('downloadPdf'))}</div>
              </PortalCard>
            ))}
          </PortalCardList>

          {/* A table on a desk. */}
          <PortalTable>
            <thead>
              <tr>
                <PortalTh>{t('invoice')}</PortalTh>
                <PortalTh>{t('vehicle')}</PortalTh>
                <PortalTh>{t('date')}</PortalTh>
                <PortalTh align="right">{t('amount')}</PortalTh>
                <PortalTh>{t('payment')}</PortalTh>
                <PortalTh />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, mark, label, href, date, owing, overdue }) => (
                <PortalTr key={inv.id}>
                  <PortalTd>
                    <PortalStretchLink href={href}>{label}</PortalStretchLink>
                  </PortalTd>
                  <PortalTd muted>
                    {inv.vehicle ? `${inv.vehicle.make} ${inv.vehicle.model}` : ''}
                  </PortalTd>
                  <PortalTd muted>{date}</PortalTd>
                  <PortalTd align="right" className="font-semibold">
                    {fmt.money(inv.totalAmount)}
                  </PortalTd>
                  <PortalTd>
                    <div className="flex flex-col items-start gap-1">
                      {paymentBadge(mark)}
                      {owing.length > 0 && <span className="text-sm">{owing.join(' · ')}</span>}
                      {overdue && (
                        <span className="text-sm font-semibold text-[color:var(--p-danger)]">
                          {overdue}
                        </span>
                      )}
                    </div>
                  </PortalTd>
                  <PortalTd align="right">{download(inv.id, t('download'))}</PortalTd>
                </PortalTr>
              ))}
            </tbody>
          </PortalTable>
        </PortalListLayout>
      )}
    </PortalShell>
  )
}
