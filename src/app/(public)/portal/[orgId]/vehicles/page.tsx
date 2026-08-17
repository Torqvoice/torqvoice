import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalVehicles } from "@/features/portal/Actions/portalActions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Car, ChevronRight } from "lucide-react";
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
          <>
          {/* Card list (phones + small tablets) */}
          <div className="space-y-2 md:hidden">
            {vehicles.map((v) => (
              <Link
                key={v.id}
                href={`/portal/${orgId}/vehicles/${v.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 active:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {v.year} {v.make} {v.model}
                    </span>
                    {v.licensePlate && (
                      <span className="shrink-0 font-mono text-sm">{v.licensePlate}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('serviceCount', { count: v._count.serviceRecords })} &middot;{" "}
                    {t('inspectionCount', { count: v._count.inspections })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>

          {/* Table (md and up). Server-rendered, so the row's link — a real
              anchor on the vehicle name — carries the navigation. */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columnVehicle')}</TableHead>
                  <TableHead className="w-[140px]">{t('columnPlate')}</TableHead>
                  <TableHead className="w-[130px]">{t('columnServices')}</TableHead>
                  <TableHead className="w-[130px]">{t('columnInspections')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id} className="group relative">
                    <TableCell className="font-medium">
                      {/* after:inset-0 stretches the click target across the
                          whole row while staying one real, focusable link. */}
                      <Link
                        href={`/portal/${orgId}/vehicles/${v.id}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none group-hover:underline"
                      >
                        {v.year} {v.make} {v.model}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {v.licensePlate || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t('serviceCount', { count: v._count.serviceRecords })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t('inspectionCount', { count: v._count.inspections })}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
