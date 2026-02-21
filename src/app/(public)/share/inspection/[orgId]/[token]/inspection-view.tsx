"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { formatDate as fmtDate, DEFAULT_DATE_FORMAT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle2, Download, FileText, X, AlertTriangle, ClipboardCheck, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { QuoteRequestDialog } from "@/features/inspections/Components/QuoteRequestDialog";
import { toast } from "sonner";

interface InspectionItem {
  id: string;
  name: string;
  section: string;
  sortOrder: number;
  condition: string;
  notes: string | null;
  imageUrls: string[];
}

interface InspectionRecord {
  id: string;
  status: string;
  mileage: number | null;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
  vehicle: {
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    mileage: number;
    customer: { name: string; email: string | null; phone: string | null } | null;
  };
  template: { name: string };
  items: InspectionItem[];
}

const conditionConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  pass: {
    label: "Pass",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100 border-emerald-300",
    icon: <Check className="h-4 w-4 text-emerald-600" />,
  },
  fail: {
    label: "Fail",
    color: "text-red-700",
    bgColor: "bg-red-100 border-red-300",
    icon: <X className="h-4 w-4 text-red-600" />,
  },
  attention: {
    label: "Attention",
    color: "text-amber-700",
    bgColor: "bg-amber-100 border-amber-300",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  },
  not_inspected: {
    label: "Not Inspected",
    color: "text-gray-500",
    bgColor: "bg-gray-100 border-gray-300",
    icon: null,
  },
};

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
}) {
  const fmt = dateFormat || DEFAULT_DATE_FORMAT;
  const tz = timezone || "America/New_York";
  const formatDate = (d: Date) => fmtDate(new Date(d), fmt, tz);

  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [quoteRequested, setQuoteRequested] = useState(hasExistingQuoteRequest);
  const [isCancelling, setIsCancelling] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);

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
        toast.success("Quote request cancelled");
        setQuoteRequested(false);
      } else {
        toast.error(data.error || "Failed to cancel request");
      }
    } catch {
      toast.error("Failed to cancel request");
    } finally {
      setIsCancelling(false);
    }
  };

  // Collect all image URLs across all inspected items for the carousel
  const allImages: { url: string; itemName: string }[] = [];
  for (const item of inspection.items) {
    if (item.condition === "not_inspected") continue;
    for (const url of item.imageUrls) {
      if (!/\.(mp4|webm|mov)$/i.test(url)) {
        allImages.push({ url, itemName: item.name });
      }
    }
  }

  const openCarousel = (globalIndex: number) => setCarouselIndex(globalIndex);
  const closeCarousel = () => setCarouselIndex(null);
  const prevImage = useCallback(
    () => setCarouselIndex((i) => (i !== null && i > 0 ? i - 1 : i)),
    []
  );
  const nextImage = useCallback(
    () => setCarouselIndex((i) => (i !== null && i < allImages.length - 1 ? i + 1 : i)),
    [allImages.length]
  );

  // Keyboard navigation for carousel
  useEffect(() => {
    if (carouselIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCarousel();
      else if (e.key === "ArrowLeft") prevImage();
      else if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [carouselIndex, prevImage, nextImage]);

  // Touch swipe for carousel
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) prevImage();
      else nextImage();
    }
    touchStartX.current = null;
  };

  const hasIssues = inspection.items.some(
    (i) => i.condition === "fail" || i.condition === "attention"
  );

  // Only show items that have been inspected (not "not_inspected"), sorted by sortOrder
  const inspectedItems = inspection.items
    .filter((i) => i.condition !== "not_inspected")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Group items by section preserving sort order
  const sectionOrder: string[] = [];
  const sections: Record<string, InspectionItem[]> = {};
  for (const item of inspectedItems) {
    if (!sections[item.section]) {
      sections[item.section] = [];
      sectionOrder.push(item.section);
    }
    sections[item.section].push(item);
  }

  const totalItems = inspectedItems.length;
  const passCount = inspectedItems.filter((i) => i.condition === "pass").length;
  const failCount = inspectedItems.filter((i) => i.condition === "fail").length;
  const attentionCount = inspectedItems.filter((i) => i.condition === "attention").length;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      {/* Header with shop branding */}
      <div className="mb-8 rounded-xl border p-6" style={{ borderTopColor: primaryColor, borderTopWidth: "4px" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {logoUrl && (
              <img src={logoUrl} alt={workshop.name} className="mb-3 h-12 object-contain" />
            )}
            <h2 className="text-xl font-bold">{workshop.name}</h2>
            {workshop.address && (
              <p className="text-sm text-gray-500">{workshop.address}</p>
            )}
            {workshop.phone && (
              <p className="text-sm text-gray-500">{workshop.phone}</p>
            )}
            {workshop.email && (
              <p className="text-sm text-gray-500">{workshop.email}</p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:text-right">
            <ClipboardCheck className="hidden h-6 w-6 sm:block" style={{ color: primaryColor }} />
            <div>
              <p className="text-lg font-bold">Vehicle Inspection</p>
              <p className="text-sm text-gray-500">{formatDate(inspection.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle and customer info */}
      <div className="mb-6 grid grid-cols-2 gap-6 rounded-lg border p-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Vehicle</h3>
          <p className="font-semibold">
            {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
          </p>
          {inspection.vehicle.vin && (
            <p className="text-sm text-gray-500">VIN: {inspection.vehicle.vin}</p>
          )}
          {inspection.vehicle.licensePlate && (
            <p className="text-sm text-gray-500">Plate: {inspection.vehicle.licensePlate}</p>
          )}
          {inspection.mileage && (
            <p className="text-sm text-gray-500">Mileage: {inspection.mileage.toLocaleString()}</p>
          )}
        </div>
        {inspection.vehicle.customer && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Customer</h3>
            <p className="font-semibold">{inspection.vehicle.customer.name}</p>
            {inspection.vehicle.customer.email && (
              <p className="text-sm text-gray-500">{inspection.vehicle.customer.email}</p>
            )}
            {inspection.vehicle.customer.phone && (
              <p className="text-sm text-gray-500">{inspection.vehicle.customer.phone}</p>
            )}
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="mb-6 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{totalItems}</span> inspected
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium">{passCount} Pass</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm font-medium">{failCount} Fail</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <span className="text-sm font-medium">{attentionCount} Attention</span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
          {totalItems > 0 && (
            <>
              <div className="bg-emerald-500" style={{ width: `${(passCount / totalItems) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(failCount / totalItems) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(attentionCount / totalItems) * 100}%` }} />
            </>
          )}
        </div>
      </div>

      {/* Quote available banner */}
      {quoteShareUrl && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <FileText className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-900">
              A quote has been prepared for this inspection
            </p>
            <p className="mt-0.5 text-xs text-emerald-700/70">
              Review the quote to see pricing and approve the recommended work.
            </p>
          </div>
          <a
            href={quoteShareUrl}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            <FileText className="h-4 w-4" />
            View Quote
          </a>
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        {hasIssues && (
          quoteRequested ? (
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleCancelQuoteRequest}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              Quote Requested
              <span className="text-muted-foreground">— Cancel</span>
            </Button>
          ) : (
            <Button
              onClick={() => setShowQuoteDialog(true)}
              style={{ backgroundColor: primaryColor }}
              className="gap-2 text-white hover:opacity-90"
            >
              <FileText className="h-4 w-4" />
              Request a Quote
            </Button>
          )
        )}
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => window.open(`/api/public/share/inspection/${orgId}/${publicToken}/pdf`, "_blank")}
        >
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>

      {/* Inspection sections */}
      <div className="space-y-6">
        {sectionOrder.map((sectionName) => (
          <div key={sectionName} className="rounded-lg border overflow-hidden">
            <div className="border-b px-4 py-3" style={{ backgroundColor: `${primaryColor}10` }}>
              <h3 className="font-semibold">{sectionName}</h3>
            </div>
            <div className="divide-y">
              {sections[sectionName].map((item) => {
                const config = conditionConfig[item.condition] || conditionConfig.not_inspected;
                return (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
                      >
                        {config.icon}
                        {config.label}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="mt-1 text-sm text-gray-500">{item.notes}</p>
                    )}
                    {item.imageUrls && item.imageUrls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.imageUrls.map((url, idx) => {
                          if (/\.(mp4|webm|mov)$/i.test(url)) {
                            return (
                              <video
                                key={idx}
                                src={url}
                                controls
                                className="h-48 max-w-sm rounded-lg border"
                              />
                            );
                          }
                          const imageIdx = allImages.findIndex(
                            (img) => img.url === url && img.itemName === item.name
                          );
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => openCarousel(imageIdx >= 0 ? imageIdx : 0)}
                              className="group overflow-hidden rounded-lg border"
                            >
                              <img
                                src={url}
                                alt={`${item.name} ${idx + 1}`}
                                className="h-32 rounded-lg object-cover transition-transform group-hover:scale-105"
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {inspection.notes && (
        <div className="mt-6 rounded-lg border p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{inspection.notes}</p>
        </div>
      )}

      {showTorqvoiceBranding && (
        <div className="mt-8 flex items-center justify-center gap-1.5">
          <span className="text-xs text-gray-400">Powered by</span>
          <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-4 w-4" />
          <a
            href="https://torqvoice.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Torqvoice
          </a>
        </div>
      )}

      {/* Image Carousel Modal */}
      {carouselIndex !== null && allImages[carouselIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={closeCarousel}
            className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:top-4 sm:right-4"
          >
            <X className="h-5 w-5" />
          </button>

          {allImages.length > 1 && (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white sm:top-4">
              {carouselIndex + 1} / {allImages.length}
            </div>
          )}

          {carouselIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {carouselIndex < allImages.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <div
            className="flex max-h-[85vh] max-w-[90vw] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={allImages[carouselIndex].url}
              alt={allImages[carouselIndex].itemName}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
              draggable={false}
            />
            <p className="mt-2 max-w-md text-center text-sm text-white/80">
              {allImages[carouselIndex].itemName}
            </p>
          </div>
        </div>
      )}

      {hasIssues && !quoteRequested && (
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
