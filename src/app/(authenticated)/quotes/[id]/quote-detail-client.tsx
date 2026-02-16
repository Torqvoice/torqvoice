"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatDate } from "@/lib/use-format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { deleteQuote, updateQuoteStatus, convertQuoteToServiceRecord } from "@/features/quotes/Actions/quoteActions";
import { sendQuoteEmail } from "@/features/email/Actions/emailActions";
import { SendEmailDialog } from "@/features/email/Components/SendEmailDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  Download,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  sent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  expired: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  converted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

interface QuoteDetail {
  id: string;
  quoteNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  validUntil: Date | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  totalAmount: number;
  notes: string | null;
  convertedToId: string | null;
  createdAt: Date;
  partItems: { id: string; partNumber: string | null; name: string; quantity: number; unitPrice: number; total: number }[];
  laborItems: { id: string; description: string; hours: number; rate: number; total: number }[];
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; company: string | null } | null;
  vehicle: { id: string; make: string; model: string; year: number; vin: string | null; licensePlate: string | null; mileage: number } | null;
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
}

export function QuoteDetailClient({
  quote,
  currencyCode = "USD",
  vehicles = [],
}: {
  quote: QuoteDetail;
  currencyCode?: string;
  vehicles?: VehicleOption[];
}) {
  const cs = getCurrencySymbol(currencyCode);
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const modal = useGlassModal();
  const confirm = useConfirm();
  const [downloading, setDownloading] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertVehicleId, setConvertVehicleId] = useState(quote.vehicle?.id || "");
  const [converting, setConverting] = useState(false);

  const partsSubtotal = quote.partItems.reduce((sum, p) => sum + p.total, 0);
  const laborSubtotal = quote.laborItems.reduce((sum, l) => sum + l.total, 0);

  const handleDelete = async () => {
    const ok = await confirm({ title: "Delete Quote", description: "This will permanently delete this quote.", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    const result = await deleteQuote(quote.id);
    if (result.success) {
      router.push("/quotes");
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to delete");
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quote-${quote.quoteNumber || quote.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      modal.open("error", "Error", "Failed to generate PDF");
    }
    setDownloading(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    await updateQuoteStatus(quote.id, newStatus);
    toast.success("Quote status updated");
    router.refresh();
  };

  const handleConvert = async () => {
    if (!convertVehicleId) {
      modal.open("error", "Error", "Please select a vehicle");
      return;
    }
    setConverting(true);
    const result = await convertQuoteToServiceRecord(quote.id, convertVehicleId);
    if (result.success && result.data) {
      router.push(`/vehicles/${convertVehicleId}/service/${result.data.id}`);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to convert");
    }
    setConverting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/quotes"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Quotes
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={statusColors[quote.status] || ""}>{quote.status}</Badge>
              <h1 className="text-2xl font-bold">{quote.title}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {quote.quoteNumber} · Created {formatDate(new Date(quote.createdAt))}
              {quote.validUntil && ` · Valid until ${formatDate(new Date(quote.validUntil))}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {quote.status !== "converted" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/quotes/${quote.id}/edit`}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowConvertDialog(true)}>
                  <ArrowRight className="mr-1 h-3.5 w-3.5" /> Convert to Work Order
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading}>
              {downloading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)}>
              <Mail className="mr-1 h-3.5 w-3.5" />
              Email
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Status Actions */}
      {quote.status !== "converted" && (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-center gap-3 pt-6">
            <span className="text-sm text-muted-foreground">Update status:</span>
            {["draft", "sent", "accepted", "rejected"].map((s) => (
              <Button
                key={s}
                variant={quote.status === s ? "default" : "outline"}
                size="sm"
                onClick={() => handleStatusChange(s)}
                className="capitalize"
              >
                {s}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Customer & Vehicle */}
      <div className="grid gap-4 sm:grid-cols-2">
        {quote.customer && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/customers/${quote.customer.id}`} className="font-semibold hover:underline">{quote.customer.name}</Link>
              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {quote.customer.company && <div className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{quote.customer.company}</div>}
                {quote.customer.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{quote.customer.email}</div>}
                {quote.customer.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{quote.customer.phone}</div>}
                {quote.customer.address && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{quote.customer.address}</div>}
              </div>
            </CardContent>
          </Card>
        )}
        {quote.vehicle && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Car className="h-4 w-4" /> Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}</p>
              {quote.vehicle.licensePlate && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{quote.vehicle.licensePlate}</p>}
              {quote.vehicle.vin && <p className="font-mono text-xs text-muted-foreground">VIN: {quote.vehicle.vin}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Description */}
      {quote.description && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{quote.description}</p></CardContent>
        </Card>
      )}

      {/* Parts */}
      {quote.partItems.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4" /> Parts ({quote.partItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Part #</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Unit Price</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quote.partItems.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 font-mono text-xs">{p.partNumber || "-"}</td>
                      <td className="py-2">{p.name}</td>
                      <td className="py-2 text-right">{p.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(p.unitPrice, currencyCode)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(p.total, currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t"><td colSpan={4} className="pt-2 text-right font-medium">Parts Subtotal</td><td className="pt-2 text-right font-bold">{formatCurrency(partsSubtotal, currencyCode)}</td></tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Labor */}
      {quote.laborItems.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Labor ({quote.laborItems.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 text-right font-medium">Hours</th>
                    <th className="pb-2 text-right font-medium">Rate</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quote.laborItems.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2">{l.description}</td>
                      <td className="py-2 text-right">{l.hours}</td>
                      <td className="py-2 text-right">{formatCurrency(l.rate, currencyCode)}/hr</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(l.total, currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t"><td colSpan={3} className="pt-2 text-right font-medium">Labor Subtotal</td><td className="pt-2 text-right font-bold">{formatCurrency(laborSubtotal, currencyCode)}</td></tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Quote Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {quote.subtotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(quote.subtotal, currencyCode)}</span></div>}
            {quote.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount{quote.discountType === "percentage" ? ` (${quote.discountValue}%)` : ""}</span>
                <span className="text-destructive">{formatCurrency(-quote.discountAmount, currencyCode)}</span>
              </div>
            )}
            {quote.taxRate > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax ({quote.taxRate}%)</span><span>{formatCurrency(quote.taxAmount, currencyCode)}</span></div>}
            <Separator />
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCurrency(quote.totalAmount, currencyCode)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {quote.notes && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Internal Notes</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{quote.notes}</p></CardContent>
        </Card>
      )}

      {/* Email Quote Dialog */}
      <SendEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        defaultEmail={quote.customer?.email || ""}
        entityLabel="Quote"
        onSend={async (email, message) => {
          return sendQuoteEmail({ quoteId: quote.id, recipientEmail: email, message });
        }}
      />

      {/* Convert to Work Order Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert Quote to Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will create a new service record (work order) from this quote. Select a vehicle for the work order.
            </p>
            <Select value={convertVehicleId} onValueChange={setConvertVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.licensePlate ? ` (${v.licensePlate})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleConvert} disabled={converting || !convertVehicleId}>
                {converting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Convert
              </Button>
              <Button variant="ghost" onClick={() => setShowConvertDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
