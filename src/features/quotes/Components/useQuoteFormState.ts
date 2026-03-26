"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { updateQuote, deleteQuote, convertQuoteToServiceRecord } from "@/features/quotes/Actions/quoteActions";
import { acknowledgeQuoteResponse } from "@/features/quotes/Actions/quoteResponseActions";
import type { QuoteRecord, QuotePartInput, QuoteLaborInput } from "./quote-page-types";
import { emptyPart, makeEmptyLabor, makeEmptyService } from "./quote-page-types";

interface SelectedVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
}

interface SelectedCustomer {
  id: string;
  name: string;
  company: string | null;
}

export function useQuoteFormState({
  quote,
  currencyCode,
  defaultTaxRate,
  taxEnabled,
  defaultLaborRate,
  t,
}: {
  quote: QuoteRecord;
  currencyCode: string;
  defaultTaxRate: number;
  taxEnabled: boolean;
  defaultLaborRate: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string;
}) {
  const router = useRouter();
  const modal = useGlassModal();
  const confirm = useConfirm();

  // Tab state
  const [activeTab, setActiveTab] = useState<"details" | "images" | "documents">("details");

  // Form state
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState(quote.status);
  const [customerId, setCustomerId] = useState(quote.customer?.id || "");
  const [vehicleId, setVehicleId] = useState(quote.vehicle?.id || "");
  const [partItems, setPartItems] = useState<QuotePartInput[]>(
    quote.partItems.map((p) => ({ partNumber: p.partNumber || "", name: p.name, quantity: p.quantity, unitPrice: p.unitPrice, total: p.total, excluded: p.excluded ?? false }))
  );
  const [laborItems, setLaborItems] = useState<QuoteLaborInput[]>(
    quote.laborItems.map((l) => ({ description: l.description, hours: l.hours, rate: l.rate, total: l.total, pricingType: (l.pricingType as "hourly" | "service") || "hourly", excluded: l.excluded ?? false }))
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
  const [resolving, setResolving] = useState(false);

  const [defaultValidDate] = useState(() =>
    quote.validUntil ? new Date(quote.validUntil).toISOString().split("T")[0] : ""
  );

  // Track selected vehicle/customer for display (initial from quote data)
  const [selectedVehicle, setSelectedVehicle] = useState<SelectedVehicle | null>(
    quote.vehicle
      ? {
          id: quote.vehicle.id,
          make: quote.vehicle.make,
          model: quote.vehicle.model,
          year: quote.vehicle.year,
          licensePlate: quote.vehicle.licensePlate,
          customerId: quote.customer?.id || null,
          customer: quote.customer ? { id: quote.customer.id, name: quote.customer.name } : null,
        }
      : null
  );
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(
    quote.customer
      ? { id: quote.customer.id, name: quote.customer.name, company: quote.customer.company }
      : null
  );

  // Unsaved changes tracking & autosave
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (!isSavingRef.current && formRef.current) {
        formRef.current.requestSubmit();
      }
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // Calculations
  const partsSubtotal = useMemo(() => partItems.reduce((sum, p) => p.excluded ? sum : sum + p.total, 0), [partItems]);
  const laborSubtotal = useMemo(() => laborItems.reduce((sum, l) => l.excluded ? sum : sum + l.total, 0), [laborItems]);
  const subtotal = partsSubtotal + laborSubtotal;
  const discountAmount = discountType === "percentage"
    ? subtotal * (discountValue / 100)
    : discountType === "fixed"
    ? Math.min(discountValue, subtotal)
    : 0;
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100);
  const totalAmount = subtotal - discountAmount + taxAmount;

  const updatePart = useCallback((index: number, field: keyof QuotePartInput, value: string | number | boolean) => {
    setPartItems((prev) => {
      const updated = [...prev];
      const part = { ...updated[index], [field]: value };
      if (field === "quantity" || field === "unitPrice") part.total = Number(part.quantity) * Number(part.unitPrice);
      updated[index] = part;
      return updated;
    });
    markDirty();
  }, [markDirty]);

  const updateLabor = useCallback((index: number, field: keyof QuoteLaborInput, value: string | number | boolean) => {
    setLaborItems((prev) => {
      const updated = [...prev];
      const labor = { ...updated[index], [field]: value };
      if (field === "hours" || field === "rate") labor.total = Number(labor.hours) * Number(labor.rate);
      updated[index] = labor;
      return updated;
    });
    markDirty();
  }, [markDirty]);

  const addPart = useCallback(() => {
    setPartItems((prev) => [...prev, emptyPart()]);
    markDirty();
  }, [markDirty]);

  const addLabor = useCallback(() => {
    setLaborItems((prev) => [...prev, makeEmptyLabor(defaultLaborRate)]);
    markDirty();
  }, [defaultLaborRate, markDirty]);

  const addService = useCallback(() => {
    setLaborItems((prev) => [...prev, makeEmptyService()]);
    markDirty();
  }, [markDirty]);

  const addLaborBulk = useCallback((items: QuoteLaborInput[]) => {
    setLaborItems((prev) => [...prev, ...items]);
    markDirty();
  }, [markDirty]);

  const deletePart = useCallback((index: number) => {
    setPartItems((prev) => prev.filter((_, j) => j !== index));
    markDirty();
  }, [markDirty]);

  const deleteLabor = useCallback((index: number) => {
    setLaborItems((prev) => prev.filter((_, j) => j !== index));
    markDirty();
  }, [markDirty]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSavingRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    isSavingRef.current = true;
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
      setHasUnsavedChanges(false);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setShowSaved(true);
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t("page.failedSave"));
    }
    isSavingRef.current = false;
    setSaving(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({ title: t("page.deleteTitle"), description: t("page.deleteDescription"), confirmLabel: t("page.delete"), destructive: true });
    if (!ok) return;
    const result = await deleteQuote(quote.id);
    if (result.success) {
      router.push("/quotes");
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t("page.failedDelete"));
    }
  };

  const saveNow = async () => {
    if (!formRef.current || isSavingRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    formRef.current.requestSubmit();
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!isSavingRef.current) return resolve();
        setTimeout(check, 50);
      };
      setTimeout(check, 50);
    });
  };

  const handleDownloadPDF = async () => {
    if (hasUnsavedChanges) await saveNow();
    setDownloading(true);
    try {
      const res = await fetch(`/api/protected/quotes/${quote.id}/pdf`);
      if (!res.ok) throw new Error(t("page.failedPdf"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quote-${quote.quoteNumber || quote.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      modal.open("error", "Error", t("page.failedPdf"));
    }
    setDownloading(false);
  };

  const handleConvert = async () => {
    if (hasUnsavedChanges) await saveNow();
    if (!convertVehicleId) {
      modal.open("error", "Error", t("page.selectVehicle"));
      return;
    }
    setConverting(true);
    const result = await convertQuoteToServiceRecord(quote.id, convertVehicleId);
    if (result.success && result.data) {
      router.push(`/vehicles/${convertVehicleId}/service/${result.data.id}`);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t("page.failedConvert"));
    }
    setConverting(false);
  };

  const handleResolveResponse = async () => {
    setResolving(true);
    const result = await acknowledgeQuoteResponse(quote.id);
    if (result.success) {
      setStatus("draft");
      toast.success(t("page.responseResolved"));
      router.refresh();
    }
    setResolving(false);
  };

  return {
    // Tab
    activeTab, setActiveTab,
    // Form state
    saving, downloading, status, setStatus,
    customerId, setCustomerId, vehicleId, setVehicleId,
    partItems, laborItems,
    taxRate, setTaxRate, taxEnabled,
    discountType, setDiscountType, discountValue, setDiscountValue,
    noteType, setNoteType, description, setDescription, notes, setNotes,
    // Dialogs
    showEmailDialog, setShowEmailDialog,
    showShareDialog, setShowShareDialog,
    showConvertDialog, setShowConvertDialog,
    convertVehicleId, setConvertVehicleId, converting,
    resolving, defaultValidDate,
    // Unsaved
    hasUnsavedChanges, showSaved, formRef,
    // Computed
    partsSubtotal, laborSubtotal, subtotal, discountAmount, taxAmount, totalAmount,
    selectedVehicle, setSelectedVehicle, selectedCustomer, setSelectedCustomer,
    // Callbacks
    markDirty, updatePart, updateLabor, addPart, addLabor, addService, addLaborBulk, deletePart, deleteLabor,
    handleSubmit, handleDelete, handleDownloadPDF,
    handleConvert, handleResolveResponse, saveNow,
  };
}

export type QuoteFormState = ReturnType<typeof useQuoteFormState>;
