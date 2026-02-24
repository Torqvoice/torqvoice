import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalVehicleDetail } from "@/features/portal/Actions/portalActions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

export default async function PortalVehicleDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; vehicleId: string }>;
}) {
  const { orgId, vehicleId } = await params;
  const result = await getPortalVehicleDetail(vehicleId);

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">
          {result.error ?? "Vehicle not found."}
        </p>
      </PortalShell>
    );
  }

  const v = result.data;

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        {/* Vehicle info header */}
        <div className="flex items-start gap-4">
          {v.imageUrl ? (
            <img
              src={v.imageUrl}
              alt={`${v.make} ${v.model}`}
              className="h-20 w-20 rounded object-cover"
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold">
              {v.year} {v.make} {v.model}
            </h1>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {v.licensePlate && <span>Plate: {v.licensePlate}</span>}
              {v.vin && <span>VIN: {v.vin}</span>}
              {v.mileage > 0 && (
                <span>{v.mileage.toLocaleString()} mi</span>
              )}
              {v.color && <span>{v.color}</span>}
            </div>
          </div>
        </div>

        <Tabs defaultValue="service-history">
          <TabsList>
            <TabsTrigger value="service-history">
              Service History ({v.serviceRecords.length})
            </TabsTrigger>
            <TabsTrigger value="inspections">
              Inspections ({v.inspections.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="service-history" className="mt-4">
            {v.serviceRecords.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No service records yet.
              </p>
            ) : (
              <div className="space-y-3">
                {v.serviceRecords.map((sr) => (
                  <Card key={sr.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {sr.invoiceNumber
                            ? `#${sr.invoiceNumber} - `
                            : ""}
                          {sr.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sr.serviceDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{sr.status}</Badge>
                        <span className="text-sm font-medium">
                          ${sr.totalAmount.toFixed(2)}
                        </span>
                        {sr.publicToken && (
                          <Link
                            href={`/share/invoice/${orgId}/${sr.publicToken}`}
                            className="text-xs text-primary hover:underline"
                          >
                            View
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="inspections" className="mt-4">
            {v.inspections.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No inspections yet.
              </p>
            ) : (
              <div className="space-y-3">
                {v.inspections.map((insp) => {
                  const conditions = insp.items.reduce(
                    (acc, item) => {
                      acc[item.condition] = (acc[item.condition] || 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>,
                  );

                  return (
                    <Card key={insp.id}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {insp.template.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(insp.createdAt).toLocaleDateString()}
                            {insp.completedAt &&
                              ` - Completed ${new Date(insp.completedAt).toLocaleDateString()}`}
                          </p>
                          <div className="mt-1 flex gap-2">
                            {conditions.good && (
                              <span className="text-xs text-green-600">
                                {conditions.good} good
                              </span>
                            )}
                            {conditions.fair && (
                              <span className="text-xs text-yellow-600">
                                {conditions.fair} fair
                              </span>
                            )}
                            {conditions.poor && (
                              <span className="text-xs text-red-600">
                                {conditions.poor} poor
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{insp.status}</Badge>
                          {insp.publicToken && (
                            <Link
                              href={`/share/inspection/${orgId}/${insp.publicToken}`}
                              className="text-xs text-primary hover:underline"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PortalShell>
  );
}
