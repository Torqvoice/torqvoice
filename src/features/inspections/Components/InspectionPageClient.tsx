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
  Settings2,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { completeInspection, deleteInspection } from "../Actions/inspectionActions";
import { createQuote } from "@/features/quotes/Actions/quoteActions";
import { InspectionShareDialog } from "./InspectionShareDialog";
import { InspectionCertificateCard } from "./InspectionCertificateCard";
import { InspectionItemRow, type InspectionItemData } from "./InspectionItemRow";
import { MediaLightbox, type LightboxImage } from "./MediaLightbox";
import { useServiceType } from "@/components/service-type-context";
import {
  CONDITION_TOKENS,
  TEST_RESULT_TOKENS,
  conditionLabel,
  countConditions,
  deriveTestResult,
  isDefect,
  worstCondition,
  type Condition,
  type SeverityScale,
} from "../Lib/conditions";

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
}

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

/** Segmented bar showing how the checks are distributed across the grades. */
function ProgressRail({
  counts,
}: {
  counts: ReturnType<typeof countConditions>;
}) {
  const segments = (["pass", "attention", "fail", "dangerous"] as const)
    .map((key) => ({ key, value: counts[key] }))
    .filter((s) => s.value > 0);

  return (
    <div
      className="bg-muted flex h-2.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={`${counts.inspected} of ${counts.total} checks graded: ${counts.pass} no defect, ${counts.attention} minor, ${counts.fail} major, ${counts.dangerous} dangerous.`}
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
  scale,
}: {
  condition: Condition;
  value: number;
  scale: SeverityScale;
}) {
  const token = CONDITION_TOKENS[condition];
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${token.bar}`} aria-hidden="true" />
      <span className="text-xs">
        <span className="font-semibold">{value}</span>{" "}
        <span className="text-muted-foreground">{conditionLabel(condition, scale)}</span>
      </span>
    </div>
  );
}

export function InspectionPageClient({
  inspection,
  smsEnabled = false,
  emailEnabled = false,
  defectHistory = {},
}: {
  inspection: InspectionData;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  /** Wording this workshop has used before, keyed by check name. */
  defectHistory?: Record<string, { text: string; severity: string }[]>;
}) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const serviceType = useServiceType();
  const [isPending, startTransition] = useTransition();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Grades are mirrored here so the summary, the section nav and the complete
  // dialog react the moment a check is saved, instead of waiting for a refresh.
  const [grades, setGrades] = useState<Record<string, Condition>>(() =>
    Object.fromEntries(inspection.items.map((i) => [i.id, i.condition as Condition]))
  );

  const isCompleted = inspection.status === "completed";
  const scale: SeverityScale = inspection.template.severityScale === "basic" ? "basic" : "eu";
  const mileageLabel = serviceType === "marine" ? "Engine hours" : "Odometer";

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
  const pendingQuoteRequest = inspection.quoteRequests?.[0] ?? null;
  const notInspected = counts.total - counts.inspected;

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
      toast.error(created.error || "Failed to create quote");
      setIsCreatingQuote(false);
    }
  };

  const handleComplete = () => {
    startTransition(async () => {
      const done = await completeInspection(inspection.id);
      if (done.success) {
        toast.success("Inspection completed");
        setShowCompleteDialog(false);
        setShowShareDialog(true);
        router.refresh();
      } else {
        toast.error(done.error || "Failed to complete inspection");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const removed = await deleteInspection(inspection.id);
      if (removed.success) {
        toast.success("Inspection deleted");
        router.push("/inspections");
      } else {
        toast.error(removed.error || "Failed to delete inspection");
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
              <span className="hidden sm:inline">Inspections</span>
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
              {isCompleted ? "Completed" : "In progress"}
            </Badge>
            {!isCompleted && (
              <Button size="sm" onClick={() => setShowCompleteDialog(true)}>
                <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                Complete
              </Button>
            )}
            {inspection.quotes.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/quotes/${inspection.quotes[0].id}`)}
              >
                <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                View quote
              </Button>
            ) : defectItems.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isCreatingQuote}
                onClick={handleCreateQuoteFromInspection}
              >
                {isCreatingQuote ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                Create quote
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
              <Share2 className="mr-1 h-4 w-4" aria-hidden="true" />
              Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions">
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
                  Download certificate
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/templates?tab=inspections">
                    <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Manage templates
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
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
              {resultToken.label}
            </h2>
            <p className="mt-1 text-sm">{resultToken.detail}</p>
            {result === "incomplete" && notInspected > 0 && (
              <p className="mt-1 text-sm">
                {notInspected} of {counts.total} checks still to grade.
              </p>
            )}
          </section>

          {/* Quote status */}
          {inspection.quotes.length > 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <FileText
                className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-sm text-emerald-900 dark:text-emerald-100">
                Quote created by {inspection.quotes[0].user.name} on{" "}
                {formatDate(new Date(inspection.quotes[0].createdAt))}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => router.push(`/quotes/${inspection.quotes[0].id}`)}
              >
                View quote
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
                  The customer asked for a quote on{" "}
                  {pendingQuoteRequest.selectedItemIds.length} item
                  {pendingQuoteRequest.selectedItemIds.length === 1 ? "" : "s"}
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
                  Create quote
                </Button>
              </div>
            </div>
          ) : null}

          <InspectionCertificateCard
            inspection={inspection}
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
                        {conditionLabel(worst, scale)}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {sectionCounts.inspected}/{sectionCounts.total} graded
                    </span>
                  </div>
                </header>
                <ul className="space-y-2 p-3">
                  {section.items.map((item) => (
                    <InspectionItemRow
                      key={item.id}
                      item={item}
                      scale={scale}
                      isCompleted={isCompleted}
                      history={defectHistory[item.name]}
                      onOpenImage={openImage}
                      onChanged={(itemId, condition) =>
                        setGrades((prev) => ({ ...prev, [itemId]: condition }))
                      }
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
              Progress
            </h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {counts.inspected}
              <span className="text-muted-foreground text-base font-normal">/{counts.total}</span>
            </p>
            <p className="text-muted-foreground text-xs">checks graded</p>
            <div className="mt-3">
              <ProgressRail counts={counts} />
            </div>
            <div className="mt-3 grid gap-1.5">
              <CountChip condition="pass" value={counts.pass} scale={scale} />
              <CountChip condition="attention" value={counts.attention} scale={scale} />
              <CountChip condition="fail" value={counts.fail} scale={scale} />
              {scale === "eu" && (
                <CountChip condition="dangerous" value={counts.dangerous} scale={scale} />
              )}
            </div>
          </section>

          <nav aria-labelledby="inspection-sections" className="bg-card rounded-lg border p-4">
            <h2 id="inspection-sections" className="text-sm font-semibold">
              Sections
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
              Vehicle
            </h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">
                  {serviceType === "marine" ? "Vessel" : "Vehicle"}
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
                    {serviceType === "marine" ? "Registration" : "Plate"}
                  </dt>
                  <dd className="font-mono">{inspection.vehicle.licensePlate}</dd>
                </div>
              )}
              {inspection.vehicle.customer && (
                <div>
                  <dt className="text-muted-foreground text-xs">Customer</dt>
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
            <h2 id="inspection-template" className="text-sm font-semibold">
              Template
            </h2>
            <p className="mt-1 text-sm">{inspection.template.name}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {scale === "eu"
                ? "Graded on the EU defect scale from Directive 2014/45/EU."
                : "Graded pass / attention / fail."}
              {inspection.template.country ? ` Country: ${inspection.template.country}.` : ""}
            </p>
            <Link
              href="/settings/templates?tab=inspections"
              className="text-primary focus-visible:ring-ring mt-3 inline-flex items-center gap-1.5 rounded-md text-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              Manage inspection templates
            </Link>
          </section>
        </aside>
      </div>

      {/* Complete confirmation */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this inspection?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  The checks are locked once the inspection is completed, and the result becomes
                  &ldquo;{TEST_RESULT_TOKENS[deriveTestResult(gradedItems)].label}&rdquo;.
                </p>
                {notInspected > 0 && (
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {notInspected} check{notInspected === 1 ? " has" : "s have"} not been graded.
                  </p>
                )}
                {counts.dangerous > 0 && (
                  <p className="text-destructive font-medium">
                    {counts.dangerous} dangerous defect
                    {counts.dangerous === 1 ? "" : "s"} recorded. The vehicle must not be used on
                    the public road.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the inspection, its grades, notes and photos. It cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete
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
