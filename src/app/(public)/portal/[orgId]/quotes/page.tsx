import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalQuotes } from "@/features/portal/Actions/portalActions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PortalQuotesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const t = await getTranslations('portal.quotes');
  const result = await getPortalQuotes();

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    );
  }

  const quotes = result.data;

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('description')}
          </p>
        </div>

        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileQuestion className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">{t('noQuotes')}</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('quote')}</TableHead>
                  <TableHead>{t('vehicle')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('amount')}</TableHead>
                  <TableHead>{t('validUntil')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">
                      {q.quoteNumber ? `#${q.quoteNumber}` : q.title}
                    </TableCell>
                    <TableCell>
                      {q.vehicle?.make} {q.vehicle?.model}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          q.status === "accepted"
                            ? "default"
                            : q.status === "sent"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {q.status}
                      </Badge>
                    </TableCell>
                    <TableCell>${q.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      {q.validUntil
                        ? new Date(q.validUntil).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {q.publicToken && (
                        <Link
                          href={`/share/quote/${orgId}/${q.publicToken}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {t('view')}
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
