"use client";

import { Check, Download, Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate as fmtDate, DEFAULT_DATE_FORMAT } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize-html";

interface QuoteRecord {
  id: string;
  quoteNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  validUntil: Date | null;
  createdAt: Date;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  totalAmount: number;
  notes: string | null;
  partItems: {
    partNumber: string | null;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  laborItems: {
    description: string;
    hours: number;
    rate: number;
    total: number;
  }[];
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    company: string | null;
  } | null;
  vehicle: {
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
  } | null;
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  converted: "Converted",
  changes_requested: "Changes Requested",
};

export function QuoteView({
  quote,
  workshop,
  currencyCode,
  orgId,
  token,
  logoUrl,
  showTorqvoiceBranding,
  dateFormat,
  timezone,
  primaryColor = "#d97706",
  headerStyle = "standard",
}: {
  quote: QuoteRecord;
  workshop: { name: string; address: string; phone: string; email: string };
  currencyCode: string;
  orgId: string;
  token: string;
  logoUrl?: string;
  showTorqvoiceBranding?: boolean;
  dateFormat?: string;
  timezone?: string;
  primaryColor?: string;
  headerStyle?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState(quote.status);
  const [submitting, setSubmitting] = useState(false);
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");

  const quoteNum = quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`;
  const df = dateFormat || DEFAULT_DATE_FORMAT;
  const tz = timezone || undefined;
  const createdDate = fmtDate(quote.createdAt, df, tz);
  const validUntilDate = quote.validUntil ? fmtDate(quote.validUntil, df, tz) : null;
  const shopName = workshop.name || "Torqvoice";

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/share/quote/${orgId}/${token}/pdf`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${quoteNum}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
    setDownloading(false);
  };

  const handleQuoteResponse = async (action: "accepted" | "changes_requested", message?: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/quote-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id, publicToken: token, action, message }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(action);
        setShowChangesForm(false);
        setChangeMessage("");
      }
    } catch {
      // silent
    }
    setSubmitting(false);
  };

  const canRespond = status === "draft" || status === "sent";

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quote</h1>
        <button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </button>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8 dark:bg-gray-900">
        {/* Header */}
        {headerStyle === "modern" ? (
          <>
            <div className="rounded-lg p-6 text-center text-white" style={{ backgroundColor: primaryColor }}>
              <img
                src={logoUrl || "/torqvoice_app_logo.png"}
                alt={shopName}
                className="mx-auto mb-2 max-h-16 max-w-[180px] object-contain"
              />
              <h2 className="text-xl font-bold sm:text-2xl">{shopName}</h2>
              {workshop.address && <p className="mt-1 text-sm opacity-80">{workshop.address}</p>}
              <div className="mt-1 flex flex-wrap justify-center gap-3 text-sm opacity-70">
                {workshop.phone && <span>Tel: {workshop.phone}</span>}
                {workshop.email && <span>{workshop.email}</span>}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold">QUOTE</h3>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                  status === "accepted"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : status === "rejected"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : status === "changes_requested"
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                }`}>
                  {statusLabels[status] || status}
                </span>
              </div>
              <div className="flex gap-3 text-sm text-gray-500">
                <span>{quoteNum}</span>
                <span>{createdDate}</span>
                {validUntilDate && <span>Valid until: {validUntilDate}</span>}
              </div>
            </div>
          </>
        ) : headerStyle === "compact" ? (
          <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "#e5e7eb" }}>
            <div className="flex items-center gap-3">
              <img
                src={logoUrl || "/torqvoice_app_logo.png"}
                alt={shopName}
                className="h-12 w-12 rounded object-contain"
              />
              <div>
                <h2 className="text-lg font-bold" style={{ color: primaryColor }}>{shopName}</h2>
                {workshop.address && <p className="text-sm text-gray-500">{workshop.address}</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <h3 className="text-lg font-bold">QUOTE</h3>
              <p className="text-sm text-gray-500">{quoteNum}</p>
              <p className="text-sm text-gray-500">{createdDate}</p>
              {validUntilDate && (
                <p className="text-sm text-gray-500">Valid until: {validUntilDate}</p>
              )}
              <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                status === "accepted"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : status === "rejected"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : status === "changes_requested"
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {statusLabels[status] || status}
              </span>
            </div>
          </div>
        ) : (
          /* Standard */
          <div className="flex flex-col gap-4 border-b-2 pb-6 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: primaryColor }}>
            <div>
              <img
                src={logoUrl || "/torqvoice_app_logo.png"}
                alt={shopName}
                className="mb-2 max-h-16 max-w-[180px] object-contain object-left"
              />
              <h2 className="text-xl font-bold sm:text-2xl" style={{ color: primaryColor }}>{shopName}</h2>
              {workshop.address && <p className="mt-1 text-sm text-gray-500">{workshop.address}</p>}
              {workshop.phone && <p className="text-sm text-gray-500">Tel: {workshop.phone}</p>}
              {workshop.email && <p className="text-sm text-gray-500">{workshop.email}</p>}
            </div>
            <div className="sm:text-right">
              {showTorqvoiceBranding && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                  <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-4 w-4" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Torqvoice</span>
                </div>
              )}
              <h3 className="text-xl font-bold" style={{ color: primaryColor }}>QUOTE</h3>
              <p className="mt-1 text-sm text-gray-500">{quoteNum}</p>
              <p className="text-sm text-gray-500">{createdDate}</p>
              {validUntilDate && (
                <p className="text-sm text-gray-500">Valid until: {validUntilDate}</p>
              )}
              <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                status === "accepted"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : status === "rejected"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : status === "changes_requested"
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {statusLabels[status] || status}
              </span>
            </div>
          </div>
        )}

        {/* Info Boxes */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {quote.customer && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
              <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>Prepared For</p>
              <p className="font-semibold">{quote.customer.name}</p>
              {quote.customer.company && <p className="text-sm">{quote.customer.company}</p>}
              {quote.customer.address && <p className="text-sm text-gray-500">{quote.customer.address}</p>}
              {quote.customer.email && <p className="text-sm text-gray-500">{quote.customer.email}</p>}
              {quote.customer.phone && <p className="text-sm text-gray-500">{quote.customer.phone}</p>}
            </div>
          )}
          {quote.vehicle && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
              <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>Vehicle</p>
              <p className="font-semibold">{quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}</p>
              {quote.vehicle.vin && <p className="text-sm text-gray-500">VIN: {quote.vehicle.vin}</p>}
              {quote.vehicle.licensePlate && <p className="text-sm text-gray-500">Plate: {quote.vehicle.licensePlate}</p>}
            </div>
          )}
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>Quote Details</p>
            <p className="font-semibold">{quote.title}</p>
          </div>
        </div>

        {/* Description */}
        {quote.description && (
          <div className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>Description</p>
            <div
              className="notes-content text-sm text-gray-600 dark:text-gray-400"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(quote.description) }}
            />
          </div>
        )}

        {/* Parts */}
        {quote.partItems.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-semibold">Parts</h4>
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <table className="w-full min-w-125 text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ backgroundColor: `${primaryColor}15` }}>
                    <th className="p-2 font-medium">Part #</th>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 text-right font-medium">Qty</th>
                    <th className="p-2 text-right font-medium">Unit Price</th>
                    <th className="p-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quote.partItems.map((p, i) => (
                    <tr key={i}>
                      <td className="p-2 font-mono text-xs">{p.partNumber || "-"}</td>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2 text-right">{p.quantity}</td>
                      <td className="p-2 text-right">{formatCurrency(p.unitPrice, currencyCode)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(p.total, currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Labor */}
        {quote.laborItems.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-semibold">Labor</h4>
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <table className="w-full min-w-112.5 text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ backgroundColor: `${primaryColor}15` }}>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 text-right font-medium">Hours</th>
                    <th className="p-2 text-right font-medium">Rate</th>
                    <th className="p-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quote.laborItems.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2">{l.description}</td>
                      <td className="p-2 text-right">{l.hours}</td>
                      <td className="p-2 text-right">{formatCurrency(l.rate, currencyCode)}/hr</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(l.total, currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-2">
          {quote.subtotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatCurrency(quote.subtotal, currencyCode)}</span>
            </div>
          )}
          {quote.discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                Discount{quote.discountType === "percentage" ? ` (${quote.discountValue}%)` : ""}
              </span>
              <span className="text-red-500">{formatCurrency(-quote.discountAmount, currencyCode)}</span>
            </div>
          )}
          {quote.taxRate > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax ({quote.taxRate}%)</span>
              <span>{formatCurrency(quote.taxAmount, currencyCode)}</span>
            </div>
          )}
          <div className="border-t pt-2" style={{ borderColor: primaryColor }}>
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span style={{ color: primaryColor }}>{formatCurrency(quote.totalAmount, currencyCode)}</span>
            </div>
          </div>
        </div>

        {/* Customer Actions */}
        {canRespond && !showChangesForm && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={() => setShowChangesForm(true)}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <MessageSquare className="h-4 w-4" />
              Request Changes
            </button>
            <button
              onClick={() => handleQuoteResponse("accepted")}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept Quote
            </button>
          </div>
        )}

        {canRespond && showChangesForm && (
          <div className="mt-8 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              What changes would you like?
            </label>
            <textarea
              value={changeMessage}
              onChange={(e) => setChangeMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              placeholder="Describe the changes you'd like..."
            />
            <div className="mt-3 flex gap-3 justify-end">
              <button
                onClick={() => { setShowChangesForm(false); setChangeMessage(""); }}
                disabled={submitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleQuoteResponse("changes_requested", changeMessage)}
                disabled={submitting || !changeMessage.trim()}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Submit Request
              </button>
            </div>
          </div>
        )}

        {status === "accepted" && (
          <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="font-medium text-emerald-700 dark:text-emerald-400">Quote Accepted</p>
            </div>
            <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
              Thank you! This quote has been accepted. The workshop will be in touch shortly.
            </p>
          </div>
        )}

        {status === "changes_requested" && (
          <div className="mt-8 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <p className="font-medium text-orange-700 dark:text-orange-400">Changes Requested</p>
            </div>
            <p className="mt-1 text-sm text-orange-600 dark:text-orange-500">
              Your change request has been submitted. The workshop will review and get back to you.
            </p>
          </div>
        )}

        {/* Torqvoice branding near totals */}
        {showTorqvoiceBranding && (
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="text-xs text-gray-400">Powered by</span>
            <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Torqvoice</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {showTorqvoiceBranding ? (
          <>
            <span className="text-xs text-gray-400">Powered by</span>
            <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-4 w-4" />
            <a
              href="https://torqvoice.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Torqvoice
            </a>
          </>
        ) : (
          <p className="text-center text-xs text-gray-400">{shopName}</p>
        )}
      </div>
    </div>
  );
}
