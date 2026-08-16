"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormatDate } from "@/lib/use-format-date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  MoreVertical,
  RotateCcw,
  Save,
  Settings2,
  Wrench,
  Share2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  completeInspection,
  createWorkOrderFromInspection,
  deleteInspection,
  reopenInspection,
} from "../Actions/inspectionActions";
import { createQuote } from "@/features/quotes/Actions/quoteActions";
import { InspectionShareDialog } from "./InspectionShareDialog";
import {
  InspectionCertificateCard,
  type TechnicianOption,
} from "./InspectionCertificateCard";
import { InspectionItemRow, type InspectionItemData } from "./InspectionItemRow";
import { MediaLightbox, type LightboxImage } from "./MediaLightbox";
import { useServiceType } from "@/components/service-type-context";
import {
  CONDITION_TOKENS,
  TEST_RESULT_TOKENS,
  countConditions,
  deriveTestResult,
  isDefect,
  worstCondition,
  type Condition,
  type SeverityScale,
} from "../Lib/conditions";
import { useConditionLabels } from "../Lib/useConditionLabels";
import { describeBlocker, findCompletionBlockers } from "../Lib/completion";

export interface InspectionData {
  id: string;
  status: string;
  mileage: number | null;
  notes: string | null;
  publicToken: string | null;
  completedAt: Date | null;
  createdAt: Date;
  organizationId: string;
  vehicleCategory: string | null;
  nextTestDue: Date | null;
  certificateNumber: string | null;
  technicianId: string | null;
  inspectorName: string | null;
  testLocation: string | null;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    mileage: number;
    customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  };
  template: {
    id: string;
    name: string;
    severityScale?: string | null;
    country?: string | null;
    standard?: string | null;
  };
  technician?: { id: string; name: string } | null;
  items: InspectionItemData[];
  quotes: {
    id: string;
    quoteNumber: string | null;
    status: string;
    createdAt: Date;
    user: { name: string };
  }[];
  quoteRequests: {
    id: string;
    message: string | null;
    selectedItemIds: string[];
    createdAt: Date;
  }[];
  serviceRecords: {
    id: string;
    title: string;
    status: string;
    invoiceNumber: string | null;
    createdAt: Date;
  }[];
}

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

/** Segmented bar showing how the checks are distributed across the grades. */
function ProgressRail({
  counts,
  label,
}: {
  counts: ReturnType<typeof countConditions>;
  label: string;
}) {
  const segments = (["pass", "attention", "fail", "dangerous"] as const)
    .map((key) => ({ key, value: counts[key] }))
    .filter((s) => s.value > 0);

  return (
    <div
      className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={label}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={CONDITION_TOKENS[segment.key].bar}
          style={{ width: `${(segment.value / Math.max(counts.total, 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

function CountChip({
  condition,
  value,
  label,
}: {
  condition: Condition;
  value: number;
  label: string;
}) {
  const token = CONDITION_TOKENS[condition];
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${token.bar}`} aria-hidden="true" />
      <span className="text-xs">
        <span className="font-semibold">{value}</span>{" "}
        <span className="text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

export function InspectionPageClient({
  inspection,
  smsEnabled = false,
  emailEnabled = false,
  defectHistory = {},
  technicians = [],
  workshopAddress = "",
}: {
  inspection: InspectionData;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  /** Wording this workshop has used before, keyed by check name. */
  defectHistory?: Record<string, { text: string; severity: string }[]>;
  technicians?: TechnicianOption[];
  workshopAddress?: string;
}) {
  const t = useTranslations("inspections.page");
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const serviceType = useServiceType();
  const [isPending, startTransition] = useTransition();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [isCreatingWorkOrder, setIsCreatingWorkOrder] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // The checklist saves each check as it is graded, which is only reassuring if
  // the page says so. Without this the technician has no way to tell a saved
  // inspection from one that silently failed halfway down a long Annex I sheet.
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  // Grades and photo counts are mirrored here so the summary, the section nav
  // and the complete dialog react the moment a check is saved, instead of
  // waiting for a refresh. Photo counts matter as much as grades: a check that
  // requires evidence blocks completion until it has some.
  const [grades, setGrades] = useState<Record<string, Condition>>(() =>
    Object.fromEntries(inspection.items.map((i) => [i.id, i.condition as Condition]))
  );
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(inspection.items.map((i) => [i.id, (i.imageUrls ?? []).length]))
  );

  const isCompleted = inspection.status === "completed";
  const scale: SeverityScale = inspection.template.severityScale === "basic" ? "basic" : "eu";
  const country = inspection.template.country ?? null;
  const { label: gradeLabel, graded, result: resultLabel, resultDetail } = useConditionLabels(scale, country);
  const mileageLabel = serviceType === "marine" ? t("engineHours") : t("odometer");

  const sections = useMemo(() => {
    const sorted = [...inspection.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const order: string[] = [];
    const grouped: Record<string, InspectionItemData[]> = {};
    for (const item of sorted) {
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
  }, [inspection.items]);

  const gradedItems = useMemo(
    () => inspection.items.map((i) => ({ condition: grades[i.id] ?? i.condition })),
    [inspection.items, grades]
  );

  const counts = useMemo(() => countConditions(gradedItems), [gradedItems]);
  const result = useMemo(
    () => deriveTestResult(gradedItems, { requireAllInspected: !isCompleted }),
    [gradedItems, isCompleted]
  );
  const resultToken = TEST_RESULT_TOKENS[result];

  const images = useMemo<LightboxImage[]>(() => {
    const list: LightboxImage[] = [];
    for (const item of inspection.items) {
      for (const url of item.imageUrls ?? []) {
        if (!isVideo(url)) list.push({ url, caption: item.name });
      }
    }
    return list;
  }, [inspection.items]);

  const defectItems = inspection.items.filter((i) => isDefect(grades[i.id] ?? i.condition));
  const blockers = useMemo(
    () =>
      findCompletionBlockers(
        inspection.items.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          condition: grades[item.id] ?? item.condition,
          required: item.required,
          photoRequired: item.photoRequired,
          photoCount: photoCounts[item.id] ?? (item.imageUrls ?? []).length,
        }))
      ),
    [inspection.items, grades, photoCounts]
  );
  const pendingQuoteRequest = inspection.quoteRequests?.[0] ?? null;
  const workOrder = inspection.serviceRecords?.[0] ?? null;
  const notInspected = counts.total - counts.inspected;

  const handleSaveState = (itemId: string, state: "saving" | "saved" | "error") => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (state === "saving") next.add(itemId);
      else next.delete(itemId);
      return next;
    });
    if (state === "saved") {
      setLastSavedAt(new Date());
      setSaveFailed(false);
    }
    if (state === "error") setSaveFailed(true);
  };

  /**
   * Fields commit on blur, so a note still being typed has not reached the
   * server yet. Taking focus off it is what actually saves; the button exists
   * because "it saves as you go" is not something a technician should have to
   * take on trust.
   */
  const handleSaveNow = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    if (savingIds.size === 0 && !saveFailed) {
      toast.success(t("allSaved"));
    }
  };

  const openImage = (url: string) => {
    const index = images.findIndex((img) => img.url === url);
    setLightboxIndex(index >= 0 ? index : null);
  };

  const handleCreateQuoteFromInspection = async () => {
    setIsCreatingQuote(true);
    const created = await createQuote({
      title: `${inspection.vehicle.year} ${inspection.vehicle.make} ${inspection.vehicle.model} - Inspection Quote`,
      vehicleId: inspection.vehicle.id,
      customerId: inspection.vehicle.customer?.id || undefined,
      inspectionId: inspection.id,
      status: "draft",
      laborItems: defectItems.map((item) => ({
        description: `${item.name}${item.notes ? ` - ${item.notes}` : ""}`,
        hours: 0,
        rate: 0,
        total: 0,
      })),
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 0,
    });
    if (created.success && created.data) {
      router.push(`/quotes/${created.data.id}`);
    } else {
      toast.error(created.error || t("quoteFailed"));
      setIsCreatingQuote(false);
    }
  };

  /**
   * Straight to a job, no quote. Plenty of customers just say "fix it", and
   * making them wait for an estimate they have already approved out loud is
   * the slowest possible way to start work.
   */
  const handleCreateWorkOrder = async () => {
    setIsCreatingWorkOrder(true);
    const created = await createWorkOrderFromInspection(inspection.id);
    if (created.success && created.data) {
      router.push(`/vehicles/${created.data.vehicleId}/service/${created.data.id}`);
    } else {
      toast.error(created.error || t("workOrderFailed"));
      setIsCreatingWorkOrder(false);
    }
  };

  const handleComplete = () => {
    startTransition(async () => {
      const done = await completeInspection(inspection.id);
      if (done.success) {
        toast.success(t("completed"));
        setShowCompleteDialog(false);
        setShowShareDialog(true);
        router.refresh();
      } else {
        toast.error(done.error || t("completeFailed"));
      }
    });
  };

  const handleReopen = () => {
    startTransition(async () => {
      const reopened = await reopenInspection(inspection.id);
      if (reopened.success) {
        toast.success(t("reopened"));
        setShowReopenDialog(false);
        router.refresh();
      } else {
        toast.error(reopened.error || t("reopenFailed"));
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const removed = await deleteInspection(inspection.id);
      if (removed.success) {
        toast.success(t("deleted"));
        router.push("/inspections");
      } else {
        toast.error(removed.error || t("deleteFailed"));
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-16 z-20 -mx-4 border-b px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/inspections"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("back")}</span>
            </Link>
            <div className="bg-border h-5 w-px" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate text-base leading-tight font-semibold">
                {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
              </h1>
              <p className="text-muted-foreground truncate text-xs">
                {inspection.template.name} &middot; {formatDate(new Date(inspection.createdAt))}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                isCompleted
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
              }
            >
              {isCompleted ? t("statusCompleted") : t("statusInProgress")}
            </Badge>
            {!isCompleted && (
              <div className="mr-1 flex items-center gap-2">
                <p className="text-muted-foreground hidden text-xs sm:block" role="status">
                  {savingIds.size > 0
                    ? t("saving")
                    : saveFailed
                      ? t("saveFailed")
                      : lastSavedAt
                        ? `Saved ${lastSavedAt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : t("savesAsYouGo")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveNow}
                  disabled={savingIds.size > 0}
                >
                  {savingIds.size > 0 ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="mr-1 h-4 w-4" aria-hidden="true" />
                  )}
                  {t("save")}
                </Button>
              </div>
            )}
            {isCompleted ? (
              <Button variant="outline" size="sm" onClick={() => setShowReopenDialog(true)}>
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("reopen")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setShowCompleteDialog(true)}>
                <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("complete")}
              </Button>
            )}
            {/* Rendered whether or not there is anything to raise yet, and
                disabled when there is not. Showing and hiding them as the
                first defect is graded shifts everything else in the bar. */}
            {workOrder ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/vehicles/${inspection.vehicle.id}/service/${workOrder.id}`)
                }
              >
                <Wrench className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("viewWorkOrder")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={isCreatingWorkOrder || defectItems.length === 0}
                title={
                  defectItems.length === 0
                    ? t("needsDefect")
                    : undefined
                }
                onClick={handleCreateWorkOrder}
              >
                {isCreatingWorkOrder ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wrench className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                {t("createWorkOrder")}
              </Button>
            )}
            {inspection.quotes.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/quotes/${inspection.quotes[0].id}`)}
              >
                <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                {t("viewQuote")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={isCreatingQuote || defectItems.length === 0}
                title={
                  defectItems.length === 0
                    ? t("needsDefect")
                    : undefined
                }
                onClick={handleCreateQuoteFromInspection}
              >
                {isCreatingQuote ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                {t("createQuote")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
              <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("share")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("moreActions")}>
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem
                  onClick={() =>
                    window.open(`/api/protected/inspections/${inspection.id}/pdf`, "_blank")
                  }
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("downloadCertificate")}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/templates?tab=inspections">
                    <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("manageTemplates")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_19rem] lg:items-start">
        {/* Main column */}
        <main className="min-w-0 space-y-5">
          {/* Overall result */}
          <section
            aria-labelledby="inspection-result"
            className={`rounded-lg border p-4 ${resultToken.soft}`}
          >
            <h2 id="inspection-result" className="text-base font-semibold">
              {resultLabel(result)}
            </h2>
            <p className="mt-1 text-sm">{resultDetail(result)}</p>
            {result === "incomplete" && notInspected > 0 && (
              <p className="mt-1 text-sm">
                {t("stillToGrade", { count: notInspected, total: counts.total })}
              </p>
            )}
          </section>

          {workOrder && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-50 p-3 dark:bg-blue-950/30">
              <Wrench
                className="h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-sm text-blue-900 dark:text-blue-100">
                {t("workOrderRaised", { number: workOrder.invoiceNumber ?? "", date: formatDate(new Date(workOrder.createdAt)) })}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() =>
                  router.push(`/vehicles/${inspection.vehicle.id}/service/${workOrder.id}`)
                }
              >
                {t("open")}
              </Button>
            </div>
          )}

          {/* Quote status */}
          {inspection.quotes.length > 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <FileText
                className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-sm text-emerald-900 dark:text-emerald-100">
                {t("quoteCreated", { name: inspection.quotes[0].user.name, date: formatDate(new Date(inspection.quotes[0].createdAt)) })}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => router.push(`/quotes/${inspection.quotes[0].id}`)}
              >
                {t("viewQuote")}
              </Button>
            </div>
          ) : pendingQuoteRequest ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/30">
              <MessageSquareText
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  {t("quoteRequested", { count: pendingQuoteRequest.selectedItemIds.length })}
                </p>
                {pendingQuoteRequest.message && (
                  <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-200/80">
                    &ldquo;{pendingQuoteRequest.message}&rdquo;
                  </p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={isCreatingQuote}
                  onClick={handleCreateQuoteFromInspection}
                >
                  {isCreatingQuote ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                  )}
                  {t("createQuote")}
                </Button>
              </div>
            </div>
          ) : null}

          <InspectionCertificateCard
            inspection={inspection}
            technicians={technicians}
            workshopAddress={workshopAddress}
            mileageLabel={mileageLabel}
            isCompleted={isCompleted}
          />

          {/* Checks */}
          {sections.map((section, index) => {
            const sectionCounts = countConditions(
              section.items.map((i) => ({ condition: grades[i.id] ?? i.condition }))
            );
            const worst = worstCondition(
              section.items.map((i) => grades[i.id] ?? i.condition)
            );
            return (
              <section
                key={section.name}
                id={`section-${index}`}
                aria-labelledby={`section-${index}-heading`}
                className="bg-card scroll-mt-36 rounded-lg border"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <h2
                    id={`section-${index}-heading`}
                    className="flex items-baseline gap-2 text-sm font-semibold"
                  >
                    {section.code && (
                      <span className="text-muted-foreground font-mono text-xs">
                        {section.code}
                      </span>
                    )}
                    {section.name}
                  </h2>
                  <div className="flex items-center gap-3">
                    {isDefect(worst) && (
                      <Badge variant="outline" className={CONDITION_TOKENS[worst].soft}>
                        {graded(worst)}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {t("graded", { graded: sectionCounts.inspected, total: sectionCounts.total })}
                    </span>
                  </div>
                </header>
                <ul className="space-y-2 p-3">
                  {section.items.map((item) => (
                    <InspectionItemRow
                      key={item.id}
                      item={item}
                      scale={scale}
                      country={country}
                      isCompleted={isCompleted}
                      history={defectHistory[item.name]}
                      onOpenImage={openImage}
                      onSaveState={handleSaveState}
                      onChanged={(itemId, change) => {
                        setGrades((prev) => ({ ...prev, [itemId]: change.condition }));
                        setPhotoCounts((prev) => ({ ...prev, [itemId]: change.photoCount }));
                      }}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </main>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-36">
          <section aria-labelledby="inspection-progress" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-progress" className="text-sm font-semibold">
              {t("progress")}
            </h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {counts.inspected}
              <span className="text-muted-foreground text-base font-normal">/{counts.total}</span>
            </p>
            <p className="text-muted-foreground text-xs">{t("checksGraded")}</p>
            <div className="mt-3">
              <ProgressRail
                counts={counts}
                label={t("progressLabel", {
                  graded: counts.inspected,
                  total: counts.total,
                  pass: counts.pass,
                  attention: counts.attention,
                  fail: counts.fail,
                  dangerous: counts.dangerous,
                })}
              />
            </div>
            <div className="mt-3 grid gap-1.5">
              <CountChip condition="pass" value={counts.pass} label={gradeLabel("pass")} />
              <CountChip condition="attention" value={counts.attention} label={gradeLabel("attention")} />
              <CountChip condition="fail" value={counts.fail} label={gradeLabel("fail")} />
              {scale === "eu" && (
                <CountChip condition="dangerous" value={counts.dangerous} label={gradeLabel("dangerous")} />
              )}
            </div>
          </section>

          <nav aria-labelledby="inspection-sections" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-sections" className="text-sm font-semibold">
              {t("sections")}
            </h2>
            <ul className="mt-2 space-y-0.5">
              {sections.map((section, index) => {
                const sectionCounts = countConditions(
                  section.items.map((i) => ({ condition: grades[i.id] ?? i.condition }))
                );
                const worst = worstCondition(
                  section.items.map((i) => grades[i.id] ?? i.condition)
                );
                return (
                  <li key={section.name}>
                    <a
                      href={`#section-${index}`}
                      className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-md px-2 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${CONDITION_TOKENS[worst].bar}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{section.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {sectionCounts.inspected}/{sectionCounts.total}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-labelledby="inspection-vehicle" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-vehicle" className="text-sm font-semibold">
              {t("vehicle")}
            </h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">
                  {serviceType === "marine" ? t("vessel") : t("vehicle")}
                </dt>
                <dd>
                  {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
                </dd>
              </div>
              {inspection.vehicle.vin && (
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {serviceType === "marine" ? "HIN" : "VIN"}
                  </dt>
                  <dd className="font-mono text-xs break-all">{inspection.vehicle.vin}</dd>
                </div>
              )}
              {inspection.vehicle.licensePlate && (
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {serviceType === "marine" ? t("registration") : t("plate")}
                  </dt>
                  <dd className="font-mono">{inspection.vehicle.licensePlate}</dd>
                </div>
              )}
              {inspection.vehicle.customer && (
                <div>
                  <dt className="text-muted-foreground text-xs">{t("customer")}</dt>
                  <dd>
                    <Link
                      href={`/customers/${inspection.vehicle.customer.id}`}
                      className="hover:underline"
                    >
                      {inspection.vehicle.customer.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section aria-labelledby="inspection-template" className="bg-card rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="inspection-template" className="text-sm font-semibold">
                {t("template")}
              </h2>
              <a
                href="https://torqvoice.com/docs/features/inspections"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 rounded text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {t("readMore")} →
              </a>
            </div>
            <p className="mt-1 text-sm">{inspection.template.name}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {scale === "eu"
                ? t("scaleEu")
                : t("scaleBasic")}
              {country ? ` ${t("country", { code: country })}` : ""}
            </p>
            <Link
              href="/settings/templates?tab=inspections"
              className="text-primary focus-visible:ring-ring mt-3 inline-flex items-center gap-1.5 rounded-md text-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("manageInspectionTemplates")}
            </Link>
          </section>
        </aside>
      </div>

      {/* Complete confirmation */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("completeTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {blockers.length > 0 ? (
                  <>
                    <p className="text-destructive font-medium">
                      {t("completeBlocked", { count: blockers.length })}
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {blockers.slice(0, 8).map((blocker) => (
                        <li key={blocker.id}>
                          {blocker.label} — {describeBlocker(blocker.reason)}
                        </li>
                      ))}
                    </ul>
                    {blockers.length > 8 && <p>and {blockers.length - 8} more.</p>}
                  </>
                ) : null}
                <p>
                  {t("completeBody", { result: resultLabel(deriveTestResult(gradedItems)) })}
                </p>
                {notInspected > 0 && (
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {t("completeUngraded", { count: notInspected })}
                  </p>
                )}
                {counts.dangerous > 0 && (
                  <p className="text-destructive font-medium">
                    {t("completeDangerous", { count: counts.dangerous })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleComplete}
              disabled={isPending || blockers.length > 0}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("complete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen confirmation */}
      <AlertDialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reopenTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {t("reopenBody")}
                </p>
                {inspection.publicToken && (
                  <p>
                    {t("reopenShared")}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopen} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("reopen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InspectionShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        inspectionId={inspection.id}
        organizationId={inspection.organizationId}
        publicToken={inspection.publicToken}
        customer={inspection.vehicle.customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
      />

      <MediaLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}
