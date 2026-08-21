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
          <>
          {/* Card list (phones + small tablets) */}
          <div className="space-y-2 md:hidden">
            {quotes.map((q) => (
              <div key={q.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {q.quoteNumber ? `#${q.quoteNumber}` : q.title}
                  </span>
                  <span className="shrink-0 font-semibold">${q.totalAmount.toFixed(2)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
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
                  {q.vehicle && (
                    <span className="truncate">
                      {q.vehicle.make} {q.vehicle.model}
                    </span>
                  )}
                  {q.validUntil && (
                    <span>
                      {t('validUntil')}: {new Date(q.validUntil).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {q.publicToken && (
                  <Link
                    href={`/share/quote/${orgId}/${q.publicToken}`}
                    className="mt-3 inline-block text-sm text-primary hover:underline"
                  >
                    {t('view')}
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* Table (md and up) */}
          <div className="hidden rounded-lg border md:block">
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
          </>
        )}
      </div>
    </PortalShell>
  );
}
