import { CreditCard, Download, FileCheck2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { offeredPaymentProviders } from '@/features/integrations/Lib/payments'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import { getPortalInvoiceSheet } from '@/features/portal/Actions/portalActions'
import {
  PortalDetailLayout,
  type PortalFact,
  PortalFacts,
  PortalLoadFailed,
  PortalPageHead,
  PortalPaymentBadge,
} from '@/features/portal/Components/Detail/PortalPageParts'
import { PortalSheetScroll } from '@/features/portal/Components/Detail/PortalSheetScroll'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import {
  PortalLinkButton,
  PortalNotice,
  PortalPanel,
  PortalSectionLabel,
  portalButtonClass,
} from '@/features/portal/Components/Ui'
import { portalPayment } from '@/features/portal/Lib/paymentState'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('share.invoice', 'title')
}

/**
 * An invoice read in the portal.
 *
 * What a customer looks for comes first, in plain type: what it comes to,
 * what is paid and still owed, when it is due, with paying and the download.
 * On a desk that sits in a column beside the sheet the PDF prints; on a phone
 * it comes first and the sheet follows at a size that can be read, scrolling
 * sideways rather than shrinking an A4 page to a thumbnail. When the workshop
 * takes payment online and the invoice has a shared link, that is where
 * paying lives, so the page offers it as just that.
 */
export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string; invoiceId: string }>
}) {
  const { orgId, invoiceId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [t, tHome, fmt, result] = await Promise.all([
    getTranslations('portal.invoices'),
    getTranslations('portal.home'),
    portalFormat(org.id),
    getPortalInvoiceSheet(invoiceId),
  ])
  const back = { href: `/portal/${orgId}/invoices`, label: t('back') }

  if (!result.success) {
    return (
      <PortalShell orgId={orgId}>
        <PortalPageHead title={t('invoice')} back={back} />
        <PortalLoadFailed>{t('failedToLoad')}</PortalLoadFailed>
      </PortalShell>
    )
  }
  if (!result.data) notFound()
  const invoice = result.data

  // The money and dates for the summary. The sheet action has already checked
  // this is the customer's own finished invoice; scoped to the workshop too.
  const [record, providers] = await Promise.all([
    db.serviceRecord.findFirst({
      where: { id: invoice.id, organizationId: org.id },
      select: {
        totalAmount: true,
        manuallyPaid: true,
        invoiceDate: true,
        invoiceDueDate: true,
        serviceDate: true,
        startDateTime: true,
        payments: { select: { amount: true } },
      },
    }),
    invoice.publicToken ? offeredPaymentProviders(org.id) : Promise.resolve([]),
  ])
  if (!record) notFound()

  const day = (at: Date) => fmt.day(at.toISOString())
  const payment = portalPayment(record)
  const owes = payment.balance > 0
  const canPayOnline = Boolean(invoice.publicToken) && providers.length > 0 && owes
  const overdue =
    owes && record.invoiceDueDate ? fmt.isPast(record.invoiceDueDate.toISOString()) : false
  const title = invoice.invoiceNumber
    ? t('invoiceNumber', { number: invoice.invoiceNumber })
    : invoice.title

  const facts: PortalFact[] = [
    {
      label: t('summaryDate'),
      value: day(record.invoiceDate ?? record.startDateTime ?? record.serviceDate),
    },
    ...(invoice.customerReference
      ? [{ label: t('summaryReference'), value: invoice.customerReference }]
      : []),
    { label: t('summaryTotal'), value: fmt.money(record.totalAmount) },
    { label: t('summaryPaid'), value: fmt.money(payment.paid) },
    ...(record.invoiceDueDate && owes
      ? [{ label: t('summaryDue'), value: day(record.invoiceDueDate), strong: true }]
      : []),
  ]

  return (
    <PortalShell orgId={orgId}>
      <PortalPageHead
        back={back}
        title={title}
        description={invoice.invoiceNumber ? invoice.title : undefined}
        badge={
          <PortalPaymentBadge state={overdue ? 'overdue' : payment.state}>
            {t(overdue ? 'overdue' : payment.state)}
          </PortalPaymentBadge>
        }
      />

      <PortalDetailLayout
        aside={
          <PortalPanel aria-labelledby="invoice-summary">
            <PortalSectionLabel id="invoice-summary">{t('summaryLeft')}</PortalSectionLabel>
            <p className="p-display mt-1.5 text-[36px]">{fmt.money(payment.balance)}</p>
            {overdue && record.invoiceDueDate && (
              <PortalNotice tone="danger" className="mt-3">
                {tHome('overdueSince', { day: day(record.invoiceDueDate) })}
              </PortalNotice>
            )}
            <div className="mt-3">
              <PortalFacts facts={facts} />
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {canPayOnline && (
                <PortalLinkButton
                  variant="accent"
                  size="lg"
                  block
                  href={`/share/invoice/${orgId}/${invoice.publicToken}`}
                >
                  <CreditCard className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {t('payOnline')}
                </PortalLinkButton>
              )}
              {/* Plain anchors: a download is a file, not a page to prefetch. */}
              <a
                href={`/portal/${orgId}/invoices/${invoice.id}/pdf`}
                download
                className={portalButtonClass({
                  variant: canPayOnline ? 'outline' : 'strong',
                  block: true,
                })}
              >
                <Download className="h-[18px] w-[18px] shrink-0" aria-hidden />
                {t('downloadPdf')}
              </a>
              {invoice.hasCertificate && (
                <a
                  href={`/portal/${orgId}/invoices/${invoice.id}/certificate`}
                  download
                  className={portalButtonClass({ variant: 'outline', block: true })}
                >
                  <FileCheck2 className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {t('downloadCertificate')}
                </a>
              )}
            </div>
          </PortalPanel>
        }
      >
        <PortalSheetScroll label={t('fullInvoice')}>
          <SpecSheet spec={invoice.spec} />
        </PortalSheetScroll>
      </PortalDetailLayout>
    </PortalShell>
  )
}
