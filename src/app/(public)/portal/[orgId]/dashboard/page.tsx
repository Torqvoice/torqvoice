import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalDashboard } from "@/features/portal/Actions/portalActions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, FileText, FileQuestion, Wrench } from "lucide-react";
import Link from "next/link";

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const result = await getPortalDashboard();

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">Failed to load dashboard.</p>
      </PortalShell>
    );
  }

  const d = result.data;

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome, {d.customer?.name ?? "Customer"}
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your account.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Vehicles</CardDescription>
              <Car className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{d.vehicleCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Open Invoices</CardDescription>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{d.openInvoiceCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardDescription>Pending Quotes</CardDescription>
              <FileQuestion className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{d.pendingQuoteCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent invoices */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Invoices</CardTitle>
              <Link
                href={`/portal/${orgId}/invoices`}
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {d.recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="space-y-3">
                {d.recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {inv.invoiceNumber
                          ? `#${inv.invoiceNumber}`
                          : inv.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.vehicle?.make} {inv.vehicle?.model} &middot;{" "}
                        {new Date(inv.serviceDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{inv.status}</Badge>
                      {inv.publicToken && (
                        <Link
                          href={`/share/invoice/${orgId}/${inv.publicToken}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent quotes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Quotes</CardTitle>
              <Link
                href={`/portal/${orgId}/quotes`}
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {d.recentQuotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
              <div className="space-y-3">
                {d.recentQuotes.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {q.quoteNumber ? `#${q.quoteNumber}` : q.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {q.vehicle?.make} {q.vehicle?.model}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{q.status}</Badge>
                      {q.publicToken && (
                        <Link
                          href={`/share/quote/${orgId}/${q.publicToken}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending service requests */}
        {d.pendingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Pending Service Requests
                </CardTitle>
                <Link
                  href={`/portal/${orgId}/request-service`}
                  className="text-sm text-primary hover:underline"
                >
                  New request
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {d.pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {req.description.slice(0, 80)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {req.vehicle?.make} {req.vehicle?.model} &middot;{" "}
                        {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      <Wrench className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
