import { getServiceRecord } from "@/features/vehicles/Actions/serviceActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { getInventoryPartsList } from "@/features/inventory/Actions/inventoryActions";
import { getLaborPresetsList } from "@/features/labor-presets/Actions/laborPresetActions";

import { getTechnicians, getOrgMembers } from "@/features/workboard/Actions/technicianActions";
import { getAuthContext } from "@/lib/get-auth-context";
import { getFeatures } from "@/lib/features";
import { getStatusReportsForService } from "@/features/status-reports/Actions/getStatusReportsForService";
import { getServiceFindings } from "@/features/vehicles/Actions/findingActions";
import { db } from "@/lib/db";
import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { ServicePageClient } from "@/features/vehicles/Components/service-page/ServicePageClient";
import { PageHeader } from "@/components/page-header";
import { getTranslations } from "next-intl/server";

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; serviceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, serviceId } = await params;
  const sp = await searchParams;
  const initialTab = typeof sp.tab === "string" ? sp.tab : undefined;

  const [result, settingsResult, inventoryResult, techniciansResult, presetsResult, authContext, session, orgMembersResult, statusReportsResult, findingsResult] =
    await Promise.all([
      getServiceRecord(serviceId),
      getSettings([
        SETTING_KEYS.CURRENCY_CODE,
        SETTING_KEYS.UNIT_SYSTEM,
        SETTING_KEYS.DEFAULT_TAX_RATE,
        SETTING_KEYS.TAX_ENABLED,
        SETTING_KEYS.DEFAULT_LABOR_RATE,
        SETTING_KEYS.INVOICE_DUE_DAYS,
      ]),
      getInventoryPartsList(),
      getTechnicians(),
      getLaborPresetsList(),
      getAuthContext(),
      getCachedSession(),
      getOrgMembers(),
      getStatusReportsForService(serviceId),
      getServiceFindings(serviceId),
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
  const defaultDueDays = Number(settings[SETTING_KEYS.INVOICE_DUE_DAYS]) || 0;
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
    invoiceDate: (record.invoiceDate ?? record.startDateTime ?? record.serviceDate).toISOString().split("T")[0],
    invoiceDueDate: record.invoiceDueDate
      ? record.invoiceDueDate.toISOString().split("T")[0]
      : defaultDueDays > 0
        ? new Date((record.invoiceDate ?? record.startDateTime ?? record.serviceDate).getTime() + defaultDueDays * 86400000).toISOString().split("T")[0]
        : "",
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
    taxInclusive: record.taxInclusive,
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

  // Fetch notification history for this service record
  const notificationHistory = await db.smsMessage.findMany({
    where: { relatedEntityId: serviceId, relatedEntityType: "service-record", direction: "outbound" },
    select: { id: true, body: true, status: true, createdAt: true, toNumber: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Fetch open observations for this vehicle (not just this service)
  const openObservations = await db.vehicleFinding.findMany({
    where: { vehicleId: id, status: { not: "resolved" } },
    select: { id: true, description: true, severity: true, notes: true, serviceRecordId: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <ServicePageClient
        record={result.data}
        vehicleId={id}
        organizationId={organizationId}
        initialTab={initialTab}
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
        telegramEnabled={features?.telegram ?? false}
        aiEnabled={aiEnabled}
        defaultDueDays={defaultDueDays}
        statusReports={(statusReportsResult.success && statusReportsResult.data ? statusReportsResult.data : []).map(r => ({ ...r, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt?.toISOString() || null, feedbackAt: r.feedbackAt?.toISOString() || null, sentAt: r.sentAt?.toISOString() || null }))}
        findings={findingsResult.success && findingsResult.data ? findingsResult.data : []}
        openObservations={openObservations}
        notificationHistory={notificationHistory.map(n => ({ ...n, createdAt: n.createdAt.toISOString() }))}
      />
    </div>
  );
}
