import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalInvoices } from "@/features/portal/Actions/portalActions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PortalInvoicesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const t = await getTranslations('portal.invoices');
  const result = await getPortalInvoices();

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    );
  }

  const invoices = result.data;

  function getPaymentStatus(inv: (typeof invoices)[number]) {
    if (inv.manuallyPaid) return "paid" as const;
    const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
    if (paid >= inv.totalAmount) return "paid" as const;
    if (paid > 0) return "partial" as const;
    return "unpaid" as const;
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
          <div className="rounded-lg border">
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
                  const payStatus = getPaymentStatus(inv);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">
                        {inv.invoiceNumber
                          ? `#${inv.invoiceNumber}`
                          : inv.title}
                      </TableCell>
                      <TableCell>
                        {inv.vehicle?.make} {inv.vehicle?.model}
                      </TableCell>
                      <TableCell>
                        {new Date(inv.serviceDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>${inv.totalAmount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            payStatus === "paid"
                              ? "default"
                              : payStatus === "partial"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {t(payStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inv.publicToken && (
                          <Link
                            href={`/share/invoice/${orgId}/${inv.publicToken}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {t('view')}
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
