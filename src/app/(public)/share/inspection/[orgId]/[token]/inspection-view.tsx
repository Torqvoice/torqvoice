"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDate as fmtDate, DEFAULT_DATE_FORMAT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Check,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Minus,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { QuoteRequestDialog } from "@/features/inspections/Components/QuoteRequestDialog";
import {
  MediaLightbox,
  type LightboxImage,
} from "@/features/inspections/Components/MediaLightbox";
import {
  CONDITION_TOKENS,
  TEST_RESULT_TOKENS,
  countConditions,
  deriveTestResult,
  gradedConditionLabel,
  formatRange,
  isDefect,
  type Condition,
  type SeverityScale,
} from "@/features/inspections/Lib/conditions";
import { toast } from "sonner";

interface InspectionItem {
  id: string;
  name: string;
  section: string;
  sortOrder: number;
  condition: string;
  notes: string | null;
  imageUrls: string[];
  description?: string | null;
  code?: string | null;
  sectionCode?: string | null;
  inputType?: string | null;
  unit?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  measuredValue?: number | null;
  textValue?: string | null;
}

interface InspectionRecord {
  id: string;
  status: string;
  mileage: number | null;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
  severityScale?: string | null;
  country?: string | null;
  vehicleCategory?: string | null;
  nextTestDue?: Date | null;
  certificateNumber?: string | null;
  inspectorName?: string | null;
  testLocation?: string | null;
  vehicle: {
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    mileage: number;
    customer: { name: string } | null;
  };
  template: { name: string; severityScale?: string | null; country?: string | null };
  items: InspectionItem[];
}

const CONDITION_ICONS: Record<Condition, React.ComponentType<{ className?: string }>> = {
  pass: Check,
  attention: TriangleAlert,
  fail: XCircle,
  dangerous: OctagonAlert,
  not_inspected: Minus,
};

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

export function InspectionView({
  inspection,
  workshop,
  logoUrl,
  primaryColor,
  showTorqvoiceBranding,
  dateFormat,
  timezone,
  publicToken,
  orgId,
  hasExistingQuoteRequest,
  quoteShareUrl,
  portalUrl,
  serviceType = "automotive",
}: {
  inspection: InspectionRecord;
  workshop: { name: string; address: string; phone: string; email: string };
  logoUrl: string;
  primaryColor: string;
  showTorqvoiceBranding: boolean;
  dateFormat?: string;
  timezone?: string;
  publicToken: string;
  orgId: string;
  hasExistingQuoteRequest: boolean;
  quoteShareUrl?: string;
  portalUrl?: string;
  serviceType?: "automotive" | "marine";
}) {
  const t = useTranslations("share.inspection");
  const tc = useTranslations("share.common");

  const fmt = dateFormat || DEFAULT_DATE_FORMAT;
  const tz = timezone || "America/New_York";
  const formatDate = (d: Date | string) => fmtDate(new Date(d), fmt, tz);

  const storedScale = inspection.severityScale ?? inspection.template.severityScale;
  const scale: SeverityScale = storedScale === "basic" ? "basic" : "eu";
  const conditionText = (condition: Condition) =>
    scale === "basic" ? t(`basic.${condition}`) : t(`eu.${condition}`);
  // Several member states record defects by grade number rather than by name,
  // so the number leads and the wording follows.
  const country = inspection.country ?? inspection.template.country ?? null;
  const gradedText = (condition: Condition) =>
    gradedConditionLabel(condition, scale, country, conditionText(condition));

  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [quoteRequested, setQuoteRequested] = useState(hasExistingQuoteRequest);
  const [isCancelling, setIsCancelling] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // A check the technician never graded is not a result; showing it would imply
  // it was looked at and found acceptable.
  const gradedItems = useMemo(
    () =>
      inspection.items
        .filter((i) => i.condition !== "not_inspected")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [inspection.items]
  );

  const sections = useMemo(() => {
    const order: string[] = [];
    const grouped: Record<string, InspectionItem[]> = {};
    for (const item of gradedItems) {
      if (!grouped[item.section]) {
        grouped[item.section] = [];
        order.push(item.section);
      }
      grouped[item.section].push(item);
    }
    return order.map((name) => ({
      name,
      code: grouped[name][0]?.sectionCode ?? null,
      items: grouped[name],
    }));
  }, [gradedItems]);

  const images = useMemo<LightboxImage[]>(() => {
    const list: LightboxImage[] = [];
    for (const item of gradedItems) {
      for (const url of item.imageUrls) {
        if (!isVideo(url)) list.push({ url, caption: item.name });
      }
    }
    return list;
  }, [gradedItems]);

  const counts = countConditions(gradedItems);
  const result = deriveTestResult(gradedItems);
  const resultToken = TEST_RESULT_TOKENS[result];
  const defects = gradedItems.filter((i) => isDefect(i.condition));
  const hasDefects = defects.length > 0;

  const handleCancelQuoteRequest = async () => {
    setIsCancelling(true);
    try {
      const res = await fetch("/api/public/forms/inspection-quote-request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: inspection.id, publicToken }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t("quoteCancelled"));
        setQuoteRequested(false);
      } else {
        toast.error(data.error || t("cancelFailed"));
      }
    } catch {
      toast.error(t("cancelFailed"));
    } finally {
      setIsCancelling(false);
    }
  };

  const openImage = (url: string) => {
    const index = images.findIndex((img) => img.url === url);
    setLightboxIndex(index >= 0 ? index : null);
  };

  const detailRows: { label: string; value: string }[] = [
    { label: t("testDate"), value: formatDate(inspection.completedAt ?? inspection.createdAt) },
    ...(inspection.certificateNumber
      ? [{ label: t("certificateNumber"), value: inspection.certificateNumber }]
      : []),
    ...(inspection.vehicleCategory
      ? [{ label: t("vehicleCategory"), value: inspection.vehicleCategory }]
      : []),
    ...(inspection.inspectorName
      ? [{ label: t("inspector"), value: inspection.inspectorName }]
      : []),
    ...(inspection.testLocation || workshop.address
      ? [{ label: t("testLocation"), value: inspection.testLocation || workshop.address }]
      : []),
    ...(inspection.nextTestDue
      ? [{ label: t("nextTestDue"), value: formatDate(inspection.nextTestDue) }]
      : []),
  ];

  const renderValue = (item: InspectionItem) => {
    if (item.inputType === "measurement" && item.measuredValue !== null && item.measuredValue !== undefined) {
      const range = formatRange(item);
      return (
        <p className="mt-1 text-sm">
          <span className="font-medium">
            {item.measuredValue}
            {item.unit ? ` ${item.unit}` : ""}
          </span>
          {range && <span className="text-gray-500"> &middot; {t("limit")}: {range}</span>}
        </p>
      );
    }
    if (item.textValue) {
      return <p className="mt-1 text-sm">{item.textValue}</p>;
    }
    return null;
  };

  const renderMedia = (item: InspectionItem) =>
    item.imageUrls.length > 0 && (
      <ul className="mt-2 flex flex-wrap gap-2">
        {item.imageUrls.map((url, index) => (
          <li key={url}>
            {isVideo(url) ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={url} controls className="h-44 max-w-sm rounded-lg border" />
            ) : (
              <button
                type="button"
                onClick={() => openImage(url)}
                aria-label={`${t("viewPhoto")}: ${item.name} ${index + 1}`}
                className="block overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${item.name} ${index + 1}`}
                  className="h-28 w-28 object-cover transition-transform hover:scale-105"
                />
              </button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      {/* Workshop header */}
      <header
        className="mb-6 rounded-xl border p-6"
        style={{ borderTopColor: primaryColor, borderTopWidth: "4px" }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="mb-3 h-12 object-contain" />
            )}
            <p className="text-xl font-bold">{workshop.name}</p>
            {workshop.address && <p className="text-sm text-gray-500">{workshop.address}</p>}
            {workshop.phone && <p className="text-sm text-gray-500">{workshop.phone}</p>}
            {workshop.email && <p className="text-sm text-gray-500">{workshop.email}</p>}
          </div>
          <div className="flex items-center gap-2 sm:text-right">
            <ShieldCheck
              className="hidden h-6 w-6 sm:block"
              style={{ color: primaryColor }}
              aria-hidden="true"
            />
            <div>
              <h1 className="text-lg font-bold">{t("title")}</h1>
              <p className="text-sm text-gray-500">{inspection.template.name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Overall result */}
      <section
        aria-labelledby="result-heading"
        className={`mb-6 rounded-xl border-2 p-5 ${resultToken.soft}`}
      >
        <h2 id="result-heading" className="text-xl font-bold">
          {t(`result.${result}`)}
        </h2>
        <p className="mt-1 text-sm">{t(`resultDetail.${result}`)}</p>
      </section>

      {/* Test details */}
      <section aria-labelledby="details-heading" className="mb-6 rounded-lg border p-4">
        <h2 id="details-heading" className="mb-3 text-xs font-semibold uppercase text-gray-500">
          {t("testDetails")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="space-y-1.5">
            <div>
              <dt className="text-xs text-gray-500">
                {serviceType === "marine" ? t("vesselLabel") : t("vehicle")}
              </dt>
              <dd className="font-semibold">
                {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
              </dd>
            </div>
            {inspection.vehicle.vin && (
              <div>
                <dt className="text-xs text-gray-500">
                  {serviceType === "marine" ? "HIN" : "VIN"}
                </dt>
                <dd className="font-mono text-sm break-all">{inspection.vehicle.vin}</dd>
              </div>
            )}
            {inspection.vehicle.licensePlate && (
              <div>
                <dt className="text-xs text-gray-500">{t("plateLabel")}</dt>
                <dd className="font-mono text-sm">{inspection.vehicle.licensePlate}</dd>
              </div>
            )}
            {inspection.mileage !== null && (
              <div>
                <dt className="text-xs text-gray-500">
                  {serviceType === "marine" ? t("engineHoursLabel") : t("odometerLabel")}
                </dt>
                <dd className="text-sm">{inspection.mileage.toLocaleString()}</dd>
              </div>
            )}
            {inspection.vehicle.customer && (
              <div>
                <dt className="text-xs text-gray-500">{t("customer")}</dt>
                <dd className="text-sm">{inspection.vehicle.customer.name}</dd>
              </div>
            )}
          </dl>
          <dl className="space-y-1.5">
            {detailRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-gray-500">{row.label}</dt>
                <dd className="text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Summary */}
      <section aria-labelledby="summary-heading" className="mb-6 rounded-lg border p-4">
        <h2 id="summary-heading" className="sr-only">
          {t("summary")}
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{counts.inspected}</span>{" "}
            {t("inspected")}
          </p>
          {(["pass", "attention", "fail", "dangerous"] as const)
            .filter((c) => scale === "eu" || c !== "dangerous")
            .map((c) => (
              <p key={c} className="flex items-center gap-1.5 text-sm">
                <span
                  className={`h-3 w-3 rounded-full ${CONDITION_TOKENS[c].bar}`}
                  aria-hidden="true"
                />
                <span className="font-medium">{counts[c]}</span>
                <span className="text-gray-500">{conditionText(c)}</span>
              </p>
            ))}
        </div>
        <div
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          role="img"
          aria-label={t("progressLabel", { graded: counts.inspected })}
        >
          {(["pass", "attention", "fail", "dangerous"] as const).map((c) =>
            counts[c] > 0 ? (
              <div
                key={c}
                className={CONDITION_TOKENS[c].bar}
                style={{ width: `${(counts[c] / Math.max(counts.inspected, 1)) * 100}%` }}
              />
            ) : null
          )}
        </div>
      </section>

      {/* Quote available */}
      {quoteShareUrl && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <FileText
            className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              {t("quoteAvailable")}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              {t("quoteAvailableDescription")}
            </p>
          </div>
          <a
            href={quoteShareUrl}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            style={{ backgroundColor: primaryColor }}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t("viewQuote")}
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-3">
        {hasDefects &&
          (quoteRequested ? (
            <Button
              variant="outline"
              className="h-11 gap-2"
              onClick={handleCancelQuoteRequest}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              )}
              {t("quoteRequested")}
              <span className="text-muted-foreground">{t("quoteRequestedCancel")}</span>
            </Button>
          ) : (
            <Button
              onClick={() => setShowQuoteDialog(true)}
              style={{ backgroundColor: primaryColor }}
              className="h-11 gap-2 text-white hover:opacity-90"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t("requestQuote")}
            </Button>
          ))}
        <Button
          variant="outline"
          className="h-11 gap-2"
          onClick={() =>
            window.open(`/api/public/share/inspection/${orgId}/${publicToken}/pdf`, "_blank")
          }
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("downloadPdf")}
        </Button>
      </div>

      {/* Deficiencies first — this is what the report is for */}
      {hasDefects && (
        <section aria-labelledby="defects-heading" className="mb-6">
          <h2 id="defects-heading" className="mb-3 text-base font-bold">
            {t("deficienciesFound", { count: defects.length })}
          </h2>
          <ul className="space-y-2">
            {defects.map((item) => {
              const token = CONDITION_TOKENS[item.condition as Condition];
              const Icon = CONDITION_ICONS[item.condition as Condition];
              return (
                <li key={item.id} className={`rounded-lg border p-3 ${token.soft}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      {item.code && <span className="mr-2 font-mono text-xs">{item.code}</span>}
                      {item.name}
                    </p>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {gradedText(item.condition as Condition)}
                    </span>
                  </div>
                  {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
                  {renderValue(item)}
                  {renderMedia(item)}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Full results */}
      <section aria-labelledby="all-results-heading" className="space-y-4">
        <h2 id="all-results-heading" className="text-base font-bold">
          {t("allResults")}
        </h2>
        {sections.map((section) => (
          <div key={section.name} className="overflow-hidden rounded-lg border">
            <h3
              className="border-b px-4 py-3 font-semibold"
              style={{ backgroundColor: `${primaryColor}12` }}
            >
              {section.code && (
                <span className="mr-2 font-mono text-xs text-gray-500">{section.code}</span>
              )}
              {section.name}
            </h3>
            <ul className="divide-y">
              {section.items.map((item) => {
                const condition = item.condition as Condition;
                const token = CONDITION_TOKENS[condition];
                const Icon = CONDITION_ICONS[condition];
                return (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">
                        {item.code && (
                          <span className="mr-2 font-mono text-xs text-gray-500">{item.code}</span>
                        )}
                        {item.name}
                      </p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${token.soft}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {gradedText(condition)}
                      </span>
                    </div>
                    {item.notes && <p className="mt-1 text-sm text-gray-500">{item.notes}</p>}
                    {renderValue(item)}
                    {renderMedia(item)}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {inspection.notes && (
        <section aria-labelledby="notes-heading" className="mt-6 rounded-lg border p-4">
          <h2 id="notes-heading" className="mb-2 text-xs font-semibold uppercase text-gray-500">
            {t("notes")}
          </h2>
          <p className="text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-300">
            {inspection.notes}
          </p>
        </section>
      )}

      <footer className="mt-8 space-y-3 border-t pt-4">
        <p className="text-center text-xs text-gray-500">{t("privacyNotice")}</p>

        {portalUrl && (
          <p className="text-center text-xs text-gray-500">
            {tc("portalMessage")}{" "}
            <a href={portalUrl} className="text-primary font-medium hover:underline">
              {tc("customerPortal")}
            </a>
          </p>
        )}

        {showTorqvoiceBranding && (
          <p className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-400">{tc("poweredBy")}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torqvoice_app_logo.png" alt="" className="h-4 w-4" />
            <a
              href="https://torqvoice.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              Torqvoice
            </a>
          </p>
        )}
      </footer>

      <MediaLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />

      {hasDefects && !quoteRequested && (
        <QuoteRequestDialog
          open={showQuoteDialog}
          onOpenChange={setShowQuoteDialog}
          items={inspection.items}
          inspectionId={inspection.id}
          publicToken={publicToken}
          onSuccess={() => setQuoteRequested(true)}
        />
      )}
    </div>
  );
}
