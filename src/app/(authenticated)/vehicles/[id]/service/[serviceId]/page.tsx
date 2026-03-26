import { getServiceRecord } from "@/features/vehicles/Actions/serviceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getInventoryPartsList } from "@/features/inventory/Actions/inventoryActions";
import { getLaborPresetsList } from "@/features/labor-presets/Actions/laborPresetActions";

import { getTechnicians, getOrgMembers } from "@/features/workboard/Actions/technicianActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { ServicePageClient } from "@/features/vehicles/Components/service-page/ServicePageClient";
import { PageHeader } from "@/components/page-header";
import { getTranslations } from "next-intl/server";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id, serviceId } = await params;

  const [result, settingsResult, inventoryResult, techniciansResult, presetsResult, authContext, session, orgMembersResult] =
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
      getTechnicians(),
      getLaborPresetsList(),
      getAuthContext(),
      getCachedSession(),
      getOrgMembers(),
    ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || (await getTranslations("service.page"))("notFound")}
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
  const laborPresets =
    presetsResult.success && presetsResult.data ? presetsResult.data : [];
  const initialVehicle = {
    id: record.vehicle.id,
    make: record.vehicle.make,
    model: record.vehicle.model,
    year: record.vehicle.year,
    licensePlate: record.vehicle.licensePlate,
  };
  const boardTechnicians = (
    techniciansResult.success && techniciansResult.data ? techniciansResult.data : []
  ).map((t) => ({ id: t.id, name: t.name, userId: t.userId }));
  const organizationId = authContext?.organizationId || "";

  // Fetch team members and features
  const membership = session?.user?.id
    ? await getCachedMembership(session.user.id)
    : null;
  const orgId = membership?.organizationId;

  const [currentUser, features, aiSettings] = await Promise.all([
    session?.user?.id
      ? db.user.findUnique({
          where: { id: session.user.id },
          select: { name: true },
        })
      : Promise.resolve(null),
    orgId ? getFeatures(orgId) : Promise.resolve(null),
    orgId
      ? db.appSetting.findMany({
          where: {
            organizationId: orgId,
            key: { in: [SETTING_KEYS.AI_ENABLED, SETTING_KEYS.AI_API_KEY] },
          },
          select: { key: true, value: true },
        })
      : Promise.resolve([]),
  ]);

  const currentUserName = currentUser?.name || "";
  const aiSettingsMap = Object.fromEntries(aiSettings.map((s) => [s.key, s.value]));
  const aiEnabled = features?.ai === true && aiSettingsMap[SETTING_KEYS.AI_ENABLED] === "true" && !!aiSettingsMap[SETTING_KEYS.AI_API_KEY];

  const initialData = {
    id: record.id,
    title: record.title,
    description: record.description || "",
    type: record.type,
    status: record.status,
    mileage: record.mileage,
    serviceDate: new Date(record.serviceDate).toISOString().split("T")[0],
    startDateTime: record.startDateTime?.toISOString() ?? null,
    endDateTime: record.endDateTime?.toISOString() ?? null,
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
      unitCost: p.unitCost ?? 0,
    })),
    laborItems: record.laborItems.map((l) => ({
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      total: l.total,
      pricingType: (l.pricingType as 'hourly' | 'service') || 'hourly',
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
        laborPresets={laborPresets}
        initialVehicle={initialVehicle}
        boardTechnicians={boardTechnicians}
        orgMembers={orgMembersResult.success && orgMembersResult.data ? orgMembersResult.data : []}
        currentUserName={currentUserName}
        imageAttachmentsForManager={imageAttachmentsForManager}
        videoAttachments={videoAttachments}
        documentAttachments={documentAttachments}
        maxImagesPerService={features?.maxImagesPerService ?? 999999}
        maxDiagnosticsPerService={features?.maxDiagnosticsPerService ?? 999999}
        maxDocumentsPerService={features?.maxDocumentsPerService ?? 999999}
        smsEnabled={features?.sms ?? false}
        emailEnabled={features?.smtp ?? false}
        aiEnabled={aiEnabled}
      />
    </div>
  );
}
