import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalVehicles } from "@/features/portal/Actions/portalActions";
import { Card, CardContent } from "@/components/ui/card";
import { Car } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PortalVehiclesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const t = await getTranslations('portal.vehicles');
  const result = await getPortalVehicles();

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
      </PortalShell>
    );
  }

  const vehicles = result.data;

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>

        {vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Car className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">
              {t('noVehicles')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <Link key={v.id} href={`/portal/${orgId}/vehicles/${v.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      {v.imageUrl ? (
                        <img
                          src={v.imageUrl}
                          alt={`${v.make} ${v.model}`}
                          className="h-16 w-16 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded bg-muted">
                          <Car className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {v.year} {v.make} {v.model}
                        </p>
                        {v.licensePlate && (
                          <p className="text-sm text-muted-foreground">
                            {v.licensePlate}
                          </p>
                        )}
                        {v.color && (
                          <p className="text-xs text-muted-foreground">
                            {v.color}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('serviceCount', { count: v._count.serviceRecords })} &middot;{" "}
                          {t('inspectionCount', { count: v._count.inspections })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
