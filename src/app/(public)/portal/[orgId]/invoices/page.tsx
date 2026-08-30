import { PortalShell } from '@/features/portal/Components/PortalShell'
import { getPortalInvoices } from '@/features/portal/Actions/portalActions'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function PortalInvoicesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const t = await getTranslations('portal.invoices')
  const result = await getPortalInvoices()

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    )
  }

  const invoices = result.data

  function getPaymentStatus(inv: (typeof invoices)[number]) {
    if (inv.manuallyPaid) return 'paid' as const
    const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0)
    if (paid >= inv.totalAmount) return 'paid' as const
    if (paid > 0) return 'partial' as const
    return 'unpaid' as const
  }

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>

        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">{t('noInvoices')}</p>
          </div>
        ) : (
          <>
            {/* Card list (phones + small tablets) */}
            <div className="space-y-2 md:hidden">
              {invoices.map((inv) => {
                const payStatus = getPaymentStatus(inv)
                return (
                  <div key={inv.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.title}
                      </span>
                      <span className="shrink-0 font-semibold">${inv.totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                      <Badge
                        variant={
                          payStatus === 'paid'
                            ? 'default'
                            : payStatus === 'partial'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {t(payStatus)}
                      </Badge>
                      {inv.vehicle && (
                        <span className="truncate">
                          {inv.vehicle.make} {inv.vehicle.model}
                        </span>
                      )}
                      <span>
                        {new Date(inv.startDateTime ?? inv.serviceDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      {inv.publicToken && (
                        <Link
                          href={`/share/invoice/${orgId}/${inv.publicToken}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {t('view')}
                        </Link>
                      )}
                      <a
                        href={`/portal/${orgId}/invoices/${inv.id}/pdf`}
                        download
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Download className="h-4 w-4" />
                        {t('download')}
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Table (md and up) */}
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('invoice')}</TableHead>
                    <TableHead>{t('vehicle')}</TableHead>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('amount')}</TableHead>
                    <TableHead>{t('payment')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const payStatus = getPaymentStatus(inv)
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.invoiceNumber ? `#${inv.invoiceNumber}` : inv.title}
                        </TableCell>
                        <TableCell>
                          {inv.vehicle?.make} {inv.vehicle?.model}
                        </TableCell>
                        <TableCell>
                          {new Date(inv.startDateTime ?? inv.serviceDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>${inv.totalAmount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              payStatus === 'paid'
                                ? 'default'
                                : payStatus === 'partial'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {t(payStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {inv.publicToken && (
                              <Link
                                href={`/share/invoice/${orgId}/${inv.publicToken}`}
                                className="text-sm text-primary hover:underline"
                              >
                                {t('view')}
                              </Link>
                            )}
                            <a
                              href={`/portal/${orgId}/invoices/${inv.id}/pdf`}
                              download
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              <Download className="h-4 w-4" />
                              {t('download')}
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  )
}
