import { PortalShell } from "@/features/portal/Components/PortalShell";
import { getPortalInspections } from "@/features/portal/Actions/portalActions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";

export default async function PortalInspectionsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const result = await getPortalInspections();

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId}>
        <p className="text-muted-foreground">Failed to load inspections.</p>
      </PortalShell>
    );
  }

  const inspections = result.data;

  return (
    <PortalShell orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Inspections</h1>
          <p className="text-muted-foreground">
            Vehicle inspection reports.
          </p>
        </div>

        {inspections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">
              No inspections yet.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((insp) => {
                  const conditions = insp.items.reduce(
                    (acc, item) => {
                      acc[item.condition] = (acc[item.condition] || 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>,
                  );

                  return (
                    <TableRow key={insp.id}>
                      <TableCell>
                        {insp.vehicle.make} {insp.vehicle.model}
                        {insp.vehicle.licensePlate && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({insp.vehicle.licensePlate})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{insp.template.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            insp.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {insp.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(insp.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 text-xs">
                          {conditions.good && (
                            <span className="text-green-600">
                              {conditions.good} good
                            </span>
                          )}
                          {conditions.fair && (
                            <span className="text-yellow-600">
                              {conditions.fair} fair
                            </span>
                          )}
                          {conditions.poor && (
                            <span className="text-red-600">
                              {conditions.poor} poor
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {insp.publicToken && (
                          <Link
                            href={`/share/inspection/${orgId}/${insp.publicToken}`}
                            className="text-sm text-primary hover:underline"
                          >
                            View
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
