import { ArrowLeft, Download, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import { getPortalInvoiceSheet } from '@/features/portal/Actions/portalActions'
import { PortalShell } from '@/features/portal/Components/PortalShell'

/**
 * An invoice read in the portal, the way a quote can be.
 *
 * Until now an invoice the workshop had not shared could only be downloaded
 * here. This draws the same sheet the PDF prints, for the signed-in customer
 * and their own invoices only, with the download beside it. When the
 * workshop has shared a link, that page is offered too, since it is where
 * paying online lives.
 */
export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ orgId: string; invoiceId: string }>
}) {
  const { orgId, invoiceId } = await params
  const t = await getTranslations('portal.invoices')
  const result = await getPortalInvoiceSheet(invoiceId)

  if (!result.success) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    )
  }
  if (!result.data) notFound()
  const invoice = result.data

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href={`/portal/${orgId}/invoices`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('back')}
            </Link>
            <h1 className="mt-1 text-2xl font-bold">
              {invoice.invoiceNumber ? `${t('invoice')} ${invoice.invoiceNumber}` : invoice.title}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {invoice.publicToken && (
              <Link
                href={`/share/invoice/${orgId}/${invoice.publicToken}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                {t('openShared')}
              </Link>
            )}
            <a
              href={`/portal/${orgId}/invoices/${invoice.id}/pdf`}
              download
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Download className="h-4 w-4" />
              {t('download')}
            </a>
          </div>
        </div>

        <SpecSheet spec={invoice.spec} />
      </div>
    </PortalShell>
  )
}
