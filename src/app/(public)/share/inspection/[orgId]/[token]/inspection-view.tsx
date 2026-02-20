"use client";

import { formatDate as fmtDate, DEFAULT_DATE_FORMAT } from "@/lib/format";
import { Check, X, AlertTriangle, ClipboardCheck } from "lucide-react";

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
}: {
  inspection: InspectionRecord;
  workshop: { name: string; address: string; phone: string; email: string };
  logoUrl: string;
  primaryColor: string;
  showTorqvoiceBranding: boolean;
  dateFormat?: string;
  timezone?: string;
}) {
  const fmt = dateFormat || DEFAULT_DATE_FORMAT;
  const tz = timezone || "America/New_York";
  const formatDate = (d: Date) => fmtDate(new Date(d), fmt, tz);

  // Only show items that have been inspected (not "not_inspected")
  const inspectedItems = inspection.items.filter((i) => i.condition !== "not_inspected");

  // Group items by section
  const sections: Record<string, InspectionItem[]> = {};
  for (const item of inspectedItems) {
    if (!sections[item.section]) sections[item.section] = [];
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
        <div className="flex items-start justify-between gap-4">
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
          <div className="flex items-center gap-2 text-right">
            <ClipboardCheck className="h-6 w-6" style={{ color: primaryColor }} />
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
      <div className="mb-6 flex items-center gap-4 rounded-lg border p-4">
        <div className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{totalItems}</span> items inspected
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
        {/* Progress bar */}
        <div className="ml-auto flex h-3 w-32 overflow-hidden rounded-full bg-gray-200">
          {totalItems > 0 && (
            <>
              <div className="bg-emerald-500" style={{ width: `${(passCount / totalItems) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(failCount / totalItems) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(attentionCount / totalItems) * 100}%` }} />
            </>
          )}
        </div>
      </div>

      {/* Inspection sections */}
      <div className="space-y-6">
        {Object.entries(sections).map(([sectionName, items]) => (
          <div key={sectionName} className="rounded-lg border overflow-hidden">
            <div className="border-b px-4 py-3" style={{ backgroundColor: `${primaryColor}10` }}>
              <h3 className="font-semibold">{sectionName}</h3>
            </div>
            <div className="divide-y">
              {items.map((item) => {
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
                        {item.imageUrls.map((url, idx) => (
                          /\.(mp4|webm|mov)$/i.test(url) ? (
                            <video
                              key={idx}
                              src={url}
                              controls
                              className="h-48 max-w-sm rounded-lg border"
                            />
                          ) : (
                            <img
                              key={idx}
                              src={url}
                              alt={`${item.name} ${idx + 1}`}
                              className="h-32 rounded-lg object-cover border"
                            />
                          )
                        ))}
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
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Powered by TorqVoice
          </p>
        </div>
      )}
    </div>
  );
}
