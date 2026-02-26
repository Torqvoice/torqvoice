"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { updateQuote, deleteQuote, convertQuoteToServiceRecord } from "@/features/quotes/Actions/quoteActions";
import { acknowledgeQuoteResponse } from "@/features/quotes/Actions/quoteResponseActions";
import { sendQuoteEmail } from "@/features/email/Actions/emailActions";
import { SendEmailDialog } from "@/features/email/Components/SendEmailDialog";
import { QuoteShareDialog } from "@/features/quotes/Components/QuoteShareDialog";
import { RichTextEditor } from "@/features/vehicles/Components/service-edit/RichTextEditor";
import type { QuotePartInput, QuoteLaborInput } from "@/features/quotes/Schema/quoteSchema";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  Check,
  ClipboardCheck,
  Download,
  FileText,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  sent: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-500 border-red-500/20",
  expired: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  converted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  changes_requested: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customerId: string | null;
  customerName: string | null;
}

interface QuoteRecord {
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
  customerMessage: string | null;
  publicToken: string | null;
  convertedToId: string | null;
  inspectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  partItems: { id: string; partNumber: string | null; name: string; quantity: number; unitPrice: number; total: number }[];
  laborItems: { id: string; description: string; hours: number; rate: number; total: number }[];
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null; company: string | null } | null;
  vehicle: { id: string; make: string; model: string; year: number; vin: string | null; licensePlate: string | null; mileage: number } | null;
}

const emptyPart = (): QuotePartInput => ({
  partNumber: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  total: 0,
});

const makeEmptyLabor = (defaultRate: number): QuoteLaborInput => ({
  description: "",
  hours: 0,
  rate: defaultRate,
  total: 0,
});

const LG_BREAKPOINT = 1024;

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = () => setIsLarge(mql.matches);
    mql.addEventListener("change", onChange);
    setIsLarge(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isLarge;
}

export function QuotePageClient({
  quote,
  organizationId,
  currencyCode = "USD",
  defaultTaxRate = 0,
  taxEnabled = true,
  defaultLaborRate = 0,
  customers = [],
  vehicles = [],
  smsEnabled = false,
  emailEnabled = false,
}: {
  quote: QuoteRecord;
  organizationId: string;
  currencyCode?: string;
  defaultTaxRate?: number;
  taxEnabled?: boolean;
  defaultLaborRate?: number;
  customers?: CustomerOption[];
  vehicles?: VehicleOption[];
  smsEnabled?: boolean;
  emailEnabled?: boolean;
}) {
  const cs = getCurrencySymbol(currencyCode);
  const router = useRouter();
  const modal = useGlassModal();
  const confirm = useConfirm();
  const isLarge = useIsLargeScreen();

  // Form state
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState(quote.status);
  const [customerId, setCustomerId] = useState(quote.customer?.id || "");
  const [vehicleId, setVehicleId] = useState(quote.vehicle?.id || "");
  const [partItems, setPartItems] = useState<QuotePartInput[]>(
    quote.partItems.map((p) => ({ partNumber: p.partNumber || "", name: p.name, quantity: p.quantity, unitPrice: p.unitPrice, total: p.total }))
  );
  const [laborItems, setLaborItems] = useState<QuoteLaborInput[]>(
    quote.laborItems.map((l) => ({ description: l.description, hours: l.hours, rate: l.rate, total: l.total }))
  );
  const [taxRate, setTaxRate] = useState(quote.taxRate ?? defaultTaxRate);
  const [discountType, setDiscountType] = useState<string>(quote.discountType || "none");
  const [discountValue, setDiscountValue] = useState(quote.discountValue ?? 0);
  const [noteType, setNoteType] = useState<"public" | "internal">("public");
  const [description, setDescription] = useState(quote.description || "");
  const [notes, setNotes] = useState(quote.notes || "");

  // Dialog state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertVehicleId, setConvertVehicleId] = useState(quote.vehicle?.id || "");
  const [converting, setConverting] = useState(false);

  const [defaultValidDate] = useState(() =>
    quote.validUntil ? new Date(quote.validUntil).toISOString().split("T")[0] : ""
  );

  // Calculations
  const partsSubtotal = partItems.reduce((sum, p) => sum + p.total, 0);
  const laborSubtotal = laborItems.reduce((sum, l) => sum + l.total, 0);
  const subtotal = partsSubtotal + laborSubtotal;
  const discountAmount = discountType === "percentage"
    ? subtotal * (discountValue / 100)
    : discountType === "fixed"
    ? Math.min(discountValue, subtotal)
    : 0;
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100);
  const totalAmount = subtotal - discountAmount + taxAmount;

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleVehicleChange = (v: string) => {
    const vid = v === "none" ? "" : v;
    setVehicleId(vid);
    if (vid) {
      const vehicle = vehicles.find((veh) => veh.id === vid);
      if (vehicle?.customerId) setCustomerId(vehicle.customerId);
    }
  };

  const updatePart = useCallback((index: number, field: keyof QuotePartInput, value: string | number) => {
    setPartItems((prev) => {
      const updated = [...prev];
      const part = { ...updated[index], [field]: value };
      if (field === "quantity" || field === "unitPrice") part.total = Number(part.quantity) * Number(part.unitPrice);
      updated[index] = part;
      return updated;
    });
  }, []);

  const updateLabor = useCallback((index: number, field: keyof QuoteLaborInput, value: string | number) => {
    setLaborItems((prev) => {
      const updated = [...prev];
      const labor = { ...updated[index], [field]: value };
      if (field === "hours" || field === "rate") labor.total = Number(labor.hours) * Number(labor.rate);
      updated[index] = labor;
      return updated;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const result = await updateQuote({
      id: quote.id,
      title: formData.get("title") as string,
      description: description || undefined,
      status,
      validUntil: (formData.get("validUntil") as string) || undefined,
      customerId: customerId || undefined,
      vehicleId: vehicleId || undefined,
      notes: notes || undefined,
      partItems: partItems.filter((p) => p.name),
      laborItems: laborItems.filter((l) => l.description),
      subtotal,
      taxRate,
      taxAmount,
      discountType: discountType === "none" ? undefined : discountType,
      discountValue,
      discountAmount,
      totalAmount,
    });
    if (result.success) {
      toast.success("Quote saved");
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to save quote");
    }
    setSaving(false);
  };

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
      const res = await fetch(`/api/protected/quotes/${quote.id}/pdf`);
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

  const [resolving, setResolving] = useState(false);

  const handleResolveResponse = async () => {
    setResolving(true);
    const result = await acknowledgeQuoteResponse(quote.id);
    if (result.success) {
      setStatus("draft");
      toast.success("Customer response resolved");
      router.refresh();
    }
    setResolving(false);
  };

  // --- Left column: Parts, Labor, Notes ---
  const leftColumn = (
    <div className="space-y-3">
      {/* Parts */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Parts</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setPartItems([...partItems, emptyPart()])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Part
          </Button>
        </div>
        {partItems.length > 0 && (
          <>
            <div className="hidden grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Part #</span><span>Name</span><span>Qty</span><span>Unit Price</span><span>Total</span><span />
            </div>
            {partItems.map((part, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto]">
                <Input placeholder="Part #" value={part.partNumber ?? ""} onChange={(e) => updatePart(i, "partNumber", e.target.value)} />
                <Input placeholder="Name *" value={part.name} onChange={(e) => updatePart(i, "name", e.target.value)} />
                <Input type="number" min="0" step="1" value={part.quantity} onChange={(e) => updatePart(i, "quantity", e.target.value)} />
                <Input type="number" min="0" step="0.01" value={part.unitPrice} onChange={(e) => updatePart(i, "unitPrice", e.target.value)} />
                <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(part.total, currencyCode)}</div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setPartItems(partItems.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={() => setPartItems([...partItems, emptyPart()])}><Plus className="h-4 w-4" /></button>
            <div className="flex justify-end pt-1 text-sm"><span className="font-medium">Parts Subtotal: {formatCurrency(partsSubtotal, currencyCode)}</span></div>
          </>
        )}
        {partItems.length === 0 && (
          <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={() => setPartItems([...partItems, emptyPart()])}>
            <Plus className="mr-1 h-4 w-4" /><span className="text-sm">Add Part</span>
          </button>
        )}
      </div>

      {/* Labor */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Labor</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}><Plus className="mr-1 h-3.5 w-3.5" /> Add Labor</Button>
        </div>
        {laborItems.length > 0 && (
          <>
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Description</span><span>Hours</span><span>Rate ({cs}/hr)</span><span>Total</span><span />
            </div>
            {laborItems.map((labor, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <Input placeholder="Description *" value={labor.description} onChange={(e) => updateLabor(i, "description", e.target.value)} className="col-span-2 sm:col-span-1" />
                <Input type="number" min="0" step="0.1" value={labor.hours} onChange={(e) => updateLabor(i, "hours", e.target.value)} />
                <Input type="number" min="0" step="0.01" value={labor.rate} onChange={(e) => updateLabor(i, "rate", e.target.value)} />
                <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(labor.total, currencyCode)}</div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setLaborItems(laborItems.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}><Plus className="h-4 w-4" /></button>
            <div className="flex justify-end pt-1 text-sm"><span className="font-medium">Labor Subtotal: {formatCurrency(laborSubtotal, currencyCode)}</span></div>
          </>
        )}
        {laborItems.length === 0 && (
          <button type="button" className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground" onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}>
            <Plus className="mr-1 h-4 w-4" /><span className="text-sm">Add Labor</span>
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-3.5 w-3.5" />Notes</h3>
          <Select value={noteType} onValueChange={(v) => setNoteType(v as "public" | "internal")}>
            <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {noteType === "public" && (
          <div className="space-y-1">
            <RichTextEditor content={description} onChange={setDescription} placeholder="Quote description shown to the customer..." />
            <p className="text-xs text-muted-foreground">Shown on the quote document</p>
          </div>
        )}
        {noteType === "internal" && (
          <div className="space-y-1">
            <RichTextEditor content={notes} onChange={setNotes} placeholder="Internal notes (not shown to customer)..." />
            <p className="text-xs text-muted-foreground">Only visible to your team</p>
          </div>
        )}
      </div>
    </div>
  );

  // --- Right column: Vehicle & Customer, Quote Details, Totals ---
  const rightColumn = (
    <div className="space-y-3">
      {/* Convert to Work Order */}
      {quote.status !== "converted" && (
        <div className="rounded-lg border p-3">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShowConvertDialog(true)}>
            <ArrowRight className="mr-1 h-3.5 w-3.5" /> Convert to Work Order
          </Button>
        </div>
      )}

      {/* Vehicle & Customer */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Vehicle</Label>
          <Select value={vehicleId || "none"} onValueChange={handleVehicleChange}>
            <SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.licensePlate ? ` (${v.licensePlate})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedVehicle && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Link href={`/vehicles/${selectedVehicle.id}`} target="_blank" className="min-w-0 flex-1 text-sm hover:underline">
              <span className="font-medium">{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</span>
              {selectedVehicle.licensePlate && <span className="ml-1.5 text-muted-foreground">{selectedVehicle.licensePlate}</span>}
            </Link>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setVehicleId("")}><X className="h-3 w-3" /></Button>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Customer</Label>
          <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedCustomer && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Link href={`/customers/${selectedCustomer.id}`} target="_blank" className="min-w-0 flex-1 text-sm hover:underline">
              <span className="font-medium">{selectedCustomer.name}</span>
              {selectedCustomer.company && <span className="ml-1.5 text-muted-foreground">{selectedCustomer.company}</span>}
            </Link>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setCustomerId("")}><X className="h-3 w-3" /></Button>
          </div>
        )}
      </div>

      {/* Quote Details */}
      <div className="rounded-lg border p-3 space-y-3">
        <h3 className="text-sm font-semibold">Quote Details</h3>
        <div className="space-y-1">
          <Label htmlFor="title" className="text-xs">Title *</Label>
          <Input id="title" name="title" placeholder="Vehicle repair estimate" defaultValue={quote.title} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="validUntil" className="text-xs">Valid Until</Label>
            <Input id="validUntil" name="validUntil" type="date" defaultValue={defaultValidDate} />
          </div>
        </div>
        {quote.inspectionId && (
          <Link
            href={`/inspections/${quote.inspectionId}`}
            className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
            <span>View linked inspection</span>
          </Link>
        )}
      </div>

      {/* Customer Response */}
      {quote.customerMessage && (status === "changes_requested" || status === "accepted") && (
        <div className={`rounded-lg border p-3 space-y-2 ${
          status === "changes_requested"
            ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20"
            : "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
        }`}>
          <div className="flex items-center justify-between">
            <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${
              status === "changes_requested" ? "text-orange-700 dark:text-orange-400" : "text-emerald-700 dark:text-emerald-400"
            }`}>
              <MessageSquare className="h-3.5 w-3.5" />
              {status === "changes_requested" ? "Changes Requested" : "Quote Accepted"}
            </h3>
            <span className={`text-[10px] ${
              status === "changes_requested" ? "text-orange-500 dark:text-orange-500" : "text-emerald-500 dark:text-emerald-500"
            }`}>
              {new Date(quote.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{" "}
              {new Date(quote.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className={`text-sm ${
            status === "changes_requested" ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"
          }`}>
            &ldquo;{quote.customerMessage}&rdquo;
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={resolving}
            onClick={handleResolveResponse}
          >
            {resolving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            Mark as Resolved
          </Button>
        </div>
      )}

      {/* Totals */}
      <div className="rounded-lg border p-3 space-y-2">
        <h3 className="text-sm font-semibold">Totals</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Parts</span><span>{formatCurrency(partsSubtotal, currencyCode)}</span></div>
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Labor</span><span>{formatCurrency(laborSubtotal, currencyCode)}</span></div>
          <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatCurrency(subtotal, currencyCode)}</span></div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Discount</span>
              <Select value={discountType} onValueChange={setDiscountType}>
                <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
              {discountType !== "none" && (
                <Input type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value === "" ? 0 : Number(e.target.value))} className="h-7 w-20 text-right text-xs" />
              )}
              {discountType === "percentage" && <span className="text-muted-foreground">%</span>}
            </div>
            {discountAmount > 0 && <span className="text-destructive">{formatCurrency(-discountAmount, currencyCode)}</span>}
          </div>
          {taxEnabled && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Tax</span>
                <Input type="number" min="0" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value === "" ? 0 : Number(e.target.value))} className="h-7 w-20 text-right text-xs" />
                <span className="text-muted-foreground">%</span>
              </div>
              <span>{formatCurrency(taxAmount, currencyCode)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{formatCurrency(totalAmount, currencyCode)}</span></div>
        </div>
      </div>

    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-4 py-2">
        <div className="flex items-center justify-between">
          <Link
            href="/quotes"
            className="flex min-w-0 items-center gap-3 text-foreground transition-colors hover:text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`shrink-0 text-xs capitalize ${statusColors[status] || ""}`}>
                  {status}
                </Badge>
                <h1 className="truncate text-lg font-semibold leading-tight">{quote.title}</h1>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {quote.quoteNumber || `Quote`}
                {quote.customer ? ` · ${quote.customer.name}` : ""}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="submit" form="quote-form" size="sm" disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save
            </Button>
            <ButtonGroup>
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading}>
                {downloading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)}>
                <Mail className="mr-1 h-3.5 w-3.5" />
                Email
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
                <Globe className="mr-1 h-3.5 w-3.5" />
                Share
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>

      {/* Form */}
      <form id="quote-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLarge ? (
          <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
            <ResizablePanel defaultSize={75} minSize={40}>
              <div className="h-full overflow-y-auto overscroll-contain p-4 pr-2">
                <div className="space-y-3 pb-40">{leftColumn}</div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={25} minSize={15}>
              <div className="h-full overflow-y-auto overscroll-contain p-4 pl-2">
                <div className="space-y-3 pb-40">{rightColumn}</div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="space-y-3 pb-40">
              {leftColumn}
              {rightColumn}
            </div>
          </div>
        )}
      </form>

      {/* Dialogs */}
      <SendEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        defaultEmail={quote.customer?.email || ""}
        entityLabel="Quote"
        onSend={async (email, message) => sendQuoteEmail({ quoteId: quote.id, recipientEmail: email, message })}
      />

      <QuoteShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        quoteId={quote.id}
        organizationId={organizationId}
        initialToken={quote.publicToken}
        customer={quote.customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
      />

      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Convert Quote to Work Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This will create a new service record (work order) from this quote. Select a vehicle for the work order.</p>
            <Select value={convertVehicleId} onValueChange={setConvertVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle..." /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.licensePlate ? ` (${v.licensePlate})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button type="button" onClick={handleConvert} disabled={converting || !convertVehicleId}>
                {converting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Convert
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowConvertDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
