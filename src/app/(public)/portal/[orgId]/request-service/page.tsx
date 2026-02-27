import { PortalShell } from "@/features/portal/Components/PortalShell";
import { ServiceRequestForm } from "@/features/portal/Components/ServiceRequestForm";
import {
  getPortalVehicles,
  getPortalServiceRequests,
} from "@/features/portal/Actions/portalActions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTranslations } from "next-intl/server";

export default async function PortalRequestServicePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const t = await getTranslations('portal.requestService');
  const [vehiclesResult, requestsResult] = await Promise.all([
    getPortalVehicles(),
    getPortalServiceRequests(),
  ]);

  if (!vehiclesResult.success || !vehiclesResult.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    );
  }

  const vehicles = vehiclesResult.data.map((v) => ({
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    licensePlate: v.licensePlate,
  }));

  const requests = requestsResult.success ? requestsResult.data ?? [] : [];

  const statusVariant = (status: string) => {
    switch (status) {
      case "accepted":
        return "default" as const;
      case "declined":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('description')}
          </p>
        </div>

        {vehicles.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                {t('noVehicles')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ServiceRequestForm orgId={orgId} vehicles={vehicles} />
        )}

        {requests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('yourRequests')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {req.vehicle.make} {req.vehicle.model}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {req.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString()}
                        {req.preferredDate &&
                          ` - ${t('preferred', { date: new Date(req.preferredDate).toLocaleDateString() })}`}
                      </p>
                      {req.adminNotes && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('staffNotes', { notes: req.adminNotes })}
                        </p>
                      )}
                    </div>
                    <Badge variant={statusVariant(req.status)}>
                      {req.status}
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
