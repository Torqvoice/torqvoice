"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useGlassModal } from "@/components/glass-modal";
import { createQuote, updateQuote } from "@/features/quotes/Actions/quoteActions";
import type { QuotePartInput, QuoteLaborInput } from "@/features/quotes/Schema/quoteSchema";
import { RichTextEditor } from "@/features/vehicles/Components/service-edit/RichTextEditor";
import { ArrowLeft, Car, ClipboardCheck, FileText, Loader2, Plus, Save, Trash2, Users, X } from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/lib/format";

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

interface InitialData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  validUntil: string | null;
  customerId: string | null;
  vehicleId: string | null;
  notes: string | null;
  partItems: QuotePartInput[];
  laborItems: QuoteLaborInput[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  totalAmount: number;
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

interface PrefillData {
  title?: string;
  vehicleId?: string;
  customerId?: string;
  inspectionId?: string;
  laborItems?: QuoteLaborInput[];
}

export function QuoteForm({
  currencyCode = "USD",
  defaultTaxRate = 0,
  taxEnabled = true,
  defaultLaborRate = 0,
  quoteValidDays = 30,
  customers = [],
  vehicles = [],
  initialData,
  prefill,
}: {
  currencyCode?: string;
  defaultTaxRate?: number;
  taxEnabled?: boolean;
  defaultLaborRate?: number;
  quoteValidDays?: number;
  customers?: CustomerOption[];
  vehicles?: VehicleOption[];
  initialData?: InitialData;
  prefill?: PrefillData;
}) {
  const cs = getCurrencySymbol(currencyCode);
  const isEdit = !!initialData;
  const router = useRouter();
  const modal = useGlassModal();
  const isLarge = useIsLargeScreen();
  const t = useTranslations("quotes");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [customerId, setCustomerId] = useState(initialData?.customerId || prefill?.customerId || "");
  const [vehicleId, setVehicleId] = useState(initialData?.vehicleId || prefill?.vehicleId || "");
  const [partItems, setPartItems] = useState<QuotePartInput[]>(initialData?.partItems || []);
  const [laborItems, setLaborItems] = useState<QuoteLaborInput[]>(initialData?.laborItems || prefill?.laborItems || []);
  const [taxRate, setTaxRate] = useState(initialData?.taxRate ?? defaultTaxRate);
  const [discountType, setDiscountType] = useState<string>(initialData?.discountType || "none");
  const [discountValue, setDiscountValue] = useState(initialData?.discountValue ?? 0);
  const [noteType, setNoteType] = useState<"public" | "internal">("public");
  const [description, setDescription] = useState(initialData?.description || "");
  const [notes, setNotes] = useState(initialData?.notes || "");

  const [defaultValidDate] = useState(() =>
    initialData?.validUntil
      ? initialData.validUntil.split("T")[0]
      : new Date(Date.now() + quoteValidDays * 86400000).toISOString().split("T")[0]
  );

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
      if (vehicle?.customerId) {
        setCustomerId(vehicle.customerId);
      }
    }
  };

  const updatePart = useCallback((index: number, field: keyof QuotePartInput, value: string | number) => {
    setPartItems((prev) => {
      const updated = [...prev];
      const part = { ...updated[index], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        part.total = Number(part.quantity) * Number(part.unitPrice);
      }
      updated[index] = part;
      return updated;
    });
  }, []);

  const updateLabor = useCallback((index: number, field: keyof QuoteLaborInput, value: string | number) => {
    setLaborItems((prev) => {
      const updated = [...prev];
      const labor = { ...updated[index], [field]: value };
      if (field === "hours" || field === "rate") {
        labor.total = Number(labor.hours) * Number(labor.rate);
      }
      updated[index] = labor;
      return updated;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const payload = {
      title: formData.get("title") as string,
      description: description || undefined,
      status,
      validUntil: (formData.get("validUntil") as string) || undefined,
      customerId: customerId || undefined,
      vehicleId: vehicleId || undefined,
      notes: notes || undefined,
      inspectionId: prefill?.inspectionId || undefined,
      partItems: partItems.filter((p) => p.name),
      laborItems: laborItems.filter((l) => l.description),
      subtotal,
      taxRate,
      taxAmount,
      discountType: discountType === "none" ? undefined : discountType,
      discountValue,
      discountAmount,
      totalAmount,
    };

    const result = isEdit
      ? await updateQuote({ id: initialData.id, ...payload })
      : await createQuote(payload);

    if (result.success && result.data) {
      toast.success(isEdit ? t("form.updated") : t("form.created"));
      router.push(`/quotes/${result.data.id}`);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || (isEdit ? t("form.failedUpdate") : t("form.failedCreate")));
    }
    setLoading(false);
  };

  // --- Left column: Parts, Labor, Notes ---
  const leftColumn = (
    <div className="space-y-3">
      {/* Parts */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("parts.title")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setPartItems([...partItems, emptyPart()])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("parts.addPart")}
          </Button>
        </div>
        {partItems.length > 0 && (
          <>
            <div className="hidden grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>{t("parts.partNumber")}</span><span>{t("parts.name")}</span><span>{t("parts.qty")}</span><span>{t("parts.unitPrice")}</span><span>{t("parts.total")}</span><span />
            </div>
            {partItems.map((part, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.7fr_1fr_1fr_auto]">
                <Input placeholder={t("parts.partNumber")} value={part.partNumber ?? ""} onChange={(e) => updatePart(i, "partNumber", e.target.value)} />
                <Input placeholder={t("parts.namePlaceholder")} value={part.name} onChange={(e) => updatePart(i, "name", e.target.value)} />
                <Input type="number" min="0" step="1" value={part.quantity} onChange={(e) => updatePart(i, "quantity", e.target.value)} />
                <Input type="number" min="0" step="0.01" value={part.unitPrice} onChange={(e) => updatePart(i, "unitPrice", e.target.value)} />
                <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(part.total, currencyCode)}</div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setPartItems(partItems.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
              onClick={() => setPartItems([...partItems, emptyPart()])}
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="flex justify-end pt-1 text-sm">
              <span className="font-medium">{t("parts.subtotal", { amount: formatCurrency(partsSubtotal, currencyCode) })}</span>
            </div>
          </>
        )}
        {partItems.length === 0 && (
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={() => setPartItems([...partItems, emptyPart()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            <span className="text-sm">{t("parts.addPart")}</span>
          </button>
        )}
      </div>

      {/* Labor */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("labor.title")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("labor.addLabor")}
          </Button>
        </div>
        {laborItems.length > 0 && (
          <>
            <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>{t("labor.description")}</span><span>{t("labor.hours")}</span><span>{t("labor.rate", { currency: cs })}</span><span>{t("labor.total")}</span><span />
            </div>
            {laborItems.map((labor, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <Input placeholder={t("labor.descriptionPlaceholder")} value={labor.description} onChange={(e) => updateLabor(i, "description", e.target.value)} className="col-span-2 sm:col-span-1" />
                <Input type="number" min="0" step="0.1" value={labor.hours} onChange={(e) => updateLabor(i, "hours", e.target.value)} />
                <Input type="number" min="0" step="0.01" value={labor.rate} onChange={(e) => updateLabor(i, "rate", e.target.value)} />
                <div className="flex items-center rounded-md bg-muted/50 px-3 text-sm font-medium">{formatCurrency(labor.total, currencyCode)}</div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setLaborItems(laborItems.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <button
              type="button"
              className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
              onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="flex justify-end pt-1 text-sm">
              <span className="font-medium">{t("labor.subtotal", { amount: formatCurrency(laborSubtotal, currencyCode) })}</span>
            </div>
          </>
        )}
        {laborItems.length === 0 && (
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 py-1.5 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            onClick={() => setLaborItems([...laborItems, makeEmptyLabor(defaultLaborRate)])}
          >
            <Plus className="mr-1 h-4 w-4" />
            <span className="text-sm">{t("labor.addLabor")}</span>
          </button>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-3.5 w-3.5" />
            {t("notes.title")}
          </h3>
          <Select value={noteType} onValueChange={(v) => setNoteType(v as "public" | "internal")}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{t("notes.public")}</SelectItem>
              <SelectItem value="internal">{t("notes.internal")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {noteType === "public" && (
          <div className="space-y-1">
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder={t("notes.publicPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("notes.publicHelper")}</p>
          </div>
        )}
        {noteType === "internal" && (
          <div className="space-y-1">
            <RichTextEditor
              content={notes}
              onChange={setNotes}
              placeholder={t("notes.internalPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("notes.internalHelper")}</p>
          </div>
        )}
      </div>
    </div>
  );

  // --- Right column: Vehicle & Customer, Quote Details, Totals ---
  const rightColumn = (
    <div className="space-y-3">
      {/* Vehicle & Customer */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("details.vehicle")}</Label>
          <Select value={vehicleId || "none"} onValueChange={handleVehicleChange}>
            <SelectTrigger><SelectValue placeholder={t("details.selectVehicle")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("details.none")}</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.licensePlate ? ` (${v.licensePlate})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedVehicle && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</span>
              {selectedVehicle.licensePlate && (
                <span className="ml-1.5 text-muted-foreground">{selectedVehicle.licensePlate}</span>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setVehicleId("")}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">{t("details.customer")}</Label>
          <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder={t("details.selectCustomer")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("details.none")}</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCustomer && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{selectedCustomer.name}</span>
              {selectedCustomer.company && (
                <span className="ml-1.5 text-muted-foreground">{selectedCustomer.company}</span>
              )}
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setCustomerId("")}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Quote Details */}
      <div className="rounded-lg border p-3 space-y-3">
        <h3 className="text-sm font-semibold">{t("details.title")}</h3>
        <div className="space-y-1">
          <Label htmlFor="title" className="text-xs">{t("details.titleLabel")}</Label>
          <Input id="title" name="title" placeholder={t("details.titlePlaceholder")} defaultValue={initialData?.title || prefill?.title || ""} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("details.status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("details.statusDraft")}</SelectItem>
                <SelectItem value="sent">{t("details.statusSent")}</SelectItem>
                <SelectItem value="accepted">{t("details.statusAccepted")}</SelectItem>
                <SelectItem value="rejected">{t("details.statusRejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="validUntil" className="text-xs">{t("details.validUntil")}</Label>
            <Input id="validUntil" name="validUntil" type="date" defaultValue={defaultValidDate} />
          </div>
        </div>
        {prefill?.inspectionId && (
          <Link
            href={`/inspections/${prefill.inspectionId}`}
            className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{t("details.viewInspection")}</span>
          </Link>
        )}
      </div>

      {/* Totals */}
      <div className="rounded-lg border p-3 space-y-2">
        <h3 className="text-sm font-semibold">{t("totals.title")}</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("totals.parts")}</span>
            <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("totals.labor")}</span>
            <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("totals.subtotal")}</span>
            <span className="font-medium">{formatCurrency(subtotal, currencyCode)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t("totals.discount")}</span>
              <Select value={discountType} onValueChange={setDiscountType}>
                <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("totals.discountNone")}</SelectItem>
                  <SelectItem value="percentage">{t("totals.discountPercentage")}</SelectItem>
                  <SelectItem value="fixed">{t("totals.discountFixed")}</SelectItem>
                </SelectContent>
              </Select>
              {discountType !== "none" && (
                <Input
                  type="number" min="0" step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="h-7 w-20 text-right text-xs"
                />
              )}
              {discountType === "percentage" && <span className="text-muted-foreground">%</span>}
            </div>
            {discountAmount > 0 && (
              <span className="text-destructive">{formatCurrency(-discountAmount, currencyCode)}</span>
            )}
          </div>
          {taxEnabled && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t("totals.tax")}</span>
                <Input
                  type="number" min="0" step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="h-7 w-20 text-right text-xs"
                />
                <span className="text-muted-foreground">%</span>
              </div>
              <span>{formatCurrency(taxAmount, currencyCode)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
            <span>{t("totals.total")}</span>
            <span>{formatCurrency(totalAmount, currencyCode)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/quotes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold">{isEdit ? t("form.editQuote") : t("form.newQuote")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/quotes">{t("form.cancel")}</Link>
          </Button>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            {isEdit ? t("form.updateQuote") : t("form.createQuote")}
          </Button>
        </div>
      </div>

      {/* Content */}
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
  );
}
