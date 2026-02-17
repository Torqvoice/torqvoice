import { getServiceRecord } from "@/features/vehicles/Actions/serviceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getInventoryPartsList } from "@/features/inventory/Actions/inventoryActions";
import { getVehicles } from "@/features/vehicles/Actions/vehicleActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { ServicePageClient } from "@/features/vehicles/Components/service-page/ServicePageClient";
import { PageHeader } from "@/components/page-header";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;

  const [result, settingsResult, inventoryResult, vehiclesResult, authContext, session] =
    await Promise.all([
      getServiceRecord(serviceId),
      getSettings([
        SETTING_KEYS.CURRENCY_CODE,
        SETTING_KEYS.UNIT_SYSTEM,
        SETTING_KEYS.DEFAULT_TAX_RATE,
        SETTING_KEYS.TAX_ENABLED,
        SETTING_KEYS.DEFAULT_LABOR_RATE,
      ]),
      getInventoryPartsList(),
      getVehicles(),
      getAuthContext(),
      getCachedSession(),
    ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Service record not found"}
          </p>
        </div>
      </>
    );
  }

  const record = result.data;
  const settings =
    settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const unitSystem = (settings[SETTING_KEYS.UNIT_SYSTEM] || "imperial") as
    | "metric"
    | "imperial";
  const taxEnabled = settings[SETTING_KEYS.TAX_ENABLED] !== "false";
  const defaultTaxRate = taxEnabled
    ? Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0
    : 0;
  const defaultLaborRate =
    Number(settings[SETTING_KEYS.DEFAULT_LABOR_RATE]) || 0;
  const inventoryParts =
    inventoryResult.success && inventoryResult.data ? inventoryResult.data : [];
  const vehicles = (
    vehiclesResult.success && vehiclesResult.data ? vehiclesResult.data : []
  ).map((v) => ({
    id: v.id,
    label: `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ""}`,
  }));
  const organizationId = authContext?.organizationId || "";

  // Fetch team members and features
  const membership = session?.user?.id
    ? await getCachedMembership(session.user.id)
    : null;
  const orgId = membership?.organizationId;

  const [members, currentUser, features] = await Promise.all([
    orgId
      ? db.organizationMember.findMany({
          where: { organizationId: orgId },
          select: { id: true, user: { select: { name: true } } },
        })
      : Promise.resolve([]),
    session?.user?.id
      ? db.user.findUnique({
          where: { id: session.user.id },
          select: { name: true },
        })
      : Promise.resolve(null),
    orgId ? getFeatures(orgId) : Promise.resolve(null),
  ]);

  const teamMembers = members.map((m) => ({ id: m.id, name: m.user.name }));
  const currentUserName = currentUser?.name || "";

  const initialData = {
    id: record.id,
    title: record.title,
    description: record.description || "",
    type: record.type,
    status: record.status,
    mileage: record.mileage,
    serviceDate: new Date(record.serviceDate).toISOString().split("T")[0],
    techName: record.techName || "",
    diagnosticNotes: record.diagnosticNotes || "",
    invoiceNotes: record.invoiceNotes || "",
    invoiceNumber: record.invoiceNumber || "",
    partItems: record.partItems.map((p) => ({
      partNumber: p.partNumber || "",
      name: p.name,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      total: p.total,
    })),
    laborItems: record.laborItems.map((l) => ({
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      total: l.total,
    })),
    attachments: [],
    subtotal: record.subtotal,
    taxRate: record.taxRate,
    taxAmount: record.taxAmount,
    totalAmount: record.totalAmount,
    discountType: record.discountType || undefined,
    discountValue: record.discountValue,
    discountAmount: record.discountAmount,
  };

  // Prepare media attachments for managers
  // The Prisma query returns includeInInvoice on each attachment; cast to include it
  const allAttachments = record.attachments as (typeof record.attachments[number] & { includeInInvoice: boolean })[] || [];
  const imageAttachmentsForManager = allAttachments
    .filter((a) => a.category === "image")
    .map((a) => ({ ...a, includeInInvoice: a.includeInInvoice ?? true }));
  const videoAttachments = allAttachments
    .filter((a) => a.category === "video")
    .map((a) => ({ ...a, includeInInvoice: a.includeInInvoice ?? true }));
  const documentAttachments = allAttachments
    .filter((a) => a.category === "document" || a.category === "diagnostic")
    .map((a) => ({ ...a, includeInInvoice: a.includeInInvoice ?? true }));

  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`;

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <ServicePageClient
        record={result.data}
        vehicleId={id}
        organizationId={organizationId}
        currencyCode={currencyCode}
        unitSystem={unitSystem}
        defaultTaxRate={defaultTaxRate}
        taxEnabled={taxEnabled}
        defaultLaborRate={defaultLaborRate}
        initialData={initialData}
        inventoryParts={inventoryParts}
        vehicles={vehicles}
        teamMembers={teamMembers}
        currentUserName={currentUserName}
        imageAttachmentsForManager={imageAttachmentsForManager}
        videoAttachments={videoAttachments}
        documentAttachments={documentAttachments}
        maxImagesPerService={features?.maxImagesPerService ?? 999999}
        maxDiagnosticsPerService={features?.maxDiagnosticsPerService ?? 999999}
        maxDocumentsPerService={features?.maxDocumentsPerService ?? 999999}
      />
    </div>
  );
}
