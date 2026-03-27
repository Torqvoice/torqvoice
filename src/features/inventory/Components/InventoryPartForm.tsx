"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useGlassModal } from "@/components/glass-modal";
import { createInventoryPart, updateInventoryPart, deleteOrphanedUploads } from "../Actions/inventoryActions";
import { aiAnalyzePartImage } from "../Actions/aiAnalyzePartImage";
import { Camera, ExternalLink, ImageIcon, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";

interface InventoryPartFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markupMultiplier?: number;
  initialBarcode?: string;
  onViewImages?: (urls: string[], startIndex: number) => void;
  part?: {
    id: string;
    partNumber: string | null;
    barcode: string | null;
    name: string;
    description: string | null;
    category: string | null;
    quantity: number;
    minQuantity: number;
    unitCost: number;
    sellPrice: number;
    supplier: string | null;
    supplierPhone: string | null;
    supplierEmail: string | null;
    supplierUrl: string | null;
    imageUrl: string | null;
    gallery: { id?: string; url: string; fileName?: string | null; description?: string | null; sortOrder: number }[];
    location: string | null;
  };
}

export function InventoryPartForm({ open, onOpenChange, part, markupMultiplier, initialBarcode, onViewImages }: InventoryPartFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const t = useTranslations('inventory');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [supplierUrl, setSupplierUrl] = useState(part?.supplierUrl ?? "");
  const [gallery, setGallery] = useState<{ id?: string; url: string; fileName?: string | null; description?: string | null; sortOrder: number }[]>(() => {
    if (part?.gallery && part.gallery.length > 0) return part.gallery;
    if (part?.imageUrl) return [{ url: part.imageUrl, sortOrder: 0 }];
    return [];
  });
  const [dragOver, setDragOver] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadedUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (open) {
      uploadedUrlsRef.current = [];
      setSupplierUrl(part?.supplierUrl ?? "");
      if (part?.gallery && part.gallery.length > 0) {
        setGallery(part.gallery);
      } else if (part?.imageUrl) {
        setGallery([{ url: part.imageUrl, sortOrder: 0 }]);
      } else {
        setGallery([]);
      }
    }
  }, [open]);

  const uploadFile = useCallback(async (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('form.imageTypeError'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('form.imageSizeError'));
      return;
    }

    setUploading(true);
    const toastId = toast.loading(t('form.imageUploading'));
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch("/api/protected/upload/inventory", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t('form.imageUploadFailed'), { id: toastId });
        return;
      }
      const { url } = await res.json();
      uploadedUrlsRef.current.push(url);
      setGallery((prev) => [...prev, { url, sortOrder: prev.length }]);
      toast.success(t('form.imageUploaded'), { id: toastId });
    } catch {
      toast.error(t('form.imageUploadFailed'), { id: toastId });
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        for (const file of Array.from(files)) {
          uploadFile(file);
        }
      }
      e.target.value = "";
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFetchMetadata = useCallback(async (url?: string) => {
    const targetUrl = url ?? supplierUrl;
    if (!targetUrl) return;

    try {
      new URL(targetUrl);
    } catch {
      return;
    }

    setFetching(true);
    try {
      const res = await fetch("/api/protected/fetch-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        modal.open("error", t('form.fetchFailed'), data.error || t('form.fetchError'));
        return;
      }

      const metadata = await res.json();
      const form = formRef.current;
      if (!form) return;

      const setIfEmpty = (name: string, value: string | undefined) => {
        if (!value) return;
        const input = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (input && !input.value) {
          input.value = value;
        }
      };

      setIfEmpty("name", metadata.name);
      setIfEmpty("description", metadata.description);
      setIfEmpty("partNumber", metadata.partNumber);
      setIfEmpty("barcode", metadata.barcode);
      setIfEmpty("supplier", metadata.supplier);
      setIfEmpty("category", metadata.category);
      if (metadata.unitCost !== undefined) {
        const unitCostInput = form.elements.namedItem("unitCost") as HTMLInputElement | null;
        if (unitCostInput && (!unitCostInput.value || unitCostInput.value === "0")) {
          unitCostInput.value = String(metadata.unitCost);
        }
      }
      if (metadata.imageUrl && gallery.length === 0) {
        setGallery([{ url: metadata.imageUrl, sortOrder: 0 }]);
      }
    } catch {
      modal.open("error", t('form.fetchFailed'), t('form.fetchError'));
    } finally {
      setFetching(false);
    }
  }, [supplierUrl, gallery, modal]);

  const handleAiAnalyze = useCallback(async () => {
    if (gallery.length === 0) return;
    setAnalyzing(true);
    const toastId = toast.loading(t('form.aiAnalyzing'));
    try {
      // Convert images to JPEG base64 on client (AI APIs require supported formats)
      const dataUris = await Promise.all(gallery.map(g =>
        new Promise<string>((resolve) => {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const maxEdge = 1024;
            let { naturalWidth: w, naturalHeight: h } = img;
            if (w > maxEdge || h > maxEdge) {
              const scale = maxEdge / Math.max(w, h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(g.url); return; }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          };
          img.onerror = () => resolve(g.url);
          img.src = g.url;
        })
      ));
      const result = await aiAnalyzePartImage(dataUris);
      if (!result.success || !result.data) {
        toast.error(result.error || t('form.aiAnalyzeFailed'), { id: toastId });
        return;
      }
      const data = result.data;
      const form = formRef.current;
      if (!form) return;

      const setIfEmpty = (name: string, value: string | undefined) => {
        if (!value) return;
        const input = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (input && !input.value) {
          input.value = value;
        }
      };

      setIfEmpty("name", data.name);
      setIfEmpty("partNumber", data.partNumber);
      setIfEmpty("barcode", data.barcode);
      setIfEmpty("category", data.category);
      setIfEmpty("description", data.description);
      setIfEmpty("supplier", data.supplier);
      toast.success(t('form.aiAnalyzeSuccess'), { id: toastId });
    } catch {
      toast.error(t('form.aiAnalyzeFailed'), { id: toastId });
    } finally {
      setAnalyzing(false);
    }
  }, [gallery, t]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      partNumber: (formData.get("partNumber") as string) || undefined,
      barcode: (formData.get("barcode") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      category: (formData.get("category") as string) || undefined,
      quantity: Number(formData.get("quantity")) || 0,
      minQuantity: Number(formData.get("minQuantity")) || 0,
      unitCost: Number(formData.get("unitCost")) || 0,
      sellPrice: Number(formData.get("sellPrice")) || 0,
      supplier: (formData.get("supplier") as string) || undefined,
      supplierPhone: (formData.get("supplierPhone") as string) || undefined,
      supplierEmail: (formData.get("supplierEmail") as string) || undefined,
      supplierUrl: supplierUrl || undefined,
      gallery: gallery.map((g, i) => ({
        id: g.id,
        url: g.url,
        fileName: g.fileName || undefined,
        description: g.description || undefined,
        sortOrder: i,
      })),
      location: (formData.get("location") as string) || undefined,
    };

    const result = part
      ? await updateInventoryPart({ ...data, id: part.id })
      : await createInventoryPart(data);

    if (result.success) {
      uploadedUrlsRef.current = [];
      onOpenChange(false);
      router.refresh();
    } else {
      modal.open("error", t('errors.error'), result.error || t('errors.saveFailed'));
    }

    setLoading(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Clean up all images uploaded during this session (they won't be saved)
      if (uploadedUrlsRef.current.length > 0) {
        deleteOrphanedUploads(uploadedUrlsRef.current);
      }
      uploadedUrlsRef.current = [];
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {part ? t('form.editPart') : t('form.addNewPart')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {part ? t('form.editPart') : t('form.addNewPart')}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier Link */}
          <div className="space-y-2">
            <Label htmlFor="supplierUrl">{t('form.supplierLink')}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="supplierUrl"
                  placeholder={t('form.supplierLinkPlaceholder')}
                  value={supplierUrl}
                  onChange={(e) => setSupplierUrl(e.target.value)}
                />
                {supplierUrl && (() => {
                  try { new URL(supplierUrl); return true; } catch { return false; }
                })() && (
                  <a
                    href={supplierUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fetching || !supplierUrl}
                onClick={() => handleFetchMetadata()}
              >
                {fetching ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t('form.fetch')}
              </Button>
            </div>
          </div>

          {/* Image + fields: stacked on mobile, side-by-side on sm+ */}
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
            {/* Image area */}
            <div className={`flex-shrink-0 ${gallery.length > 0 ? "sm:w-52" : "sm:w-44"}`}>
              <Label className="mb-2 block">{t('form.image')}</Label>
              {gallery.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2">
                  {gallery.map((g, i) => (
                    <div
                      key={g.url}
                      className="relative aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer"
                      onClick={() => { onOpenChange(false); onViewImages?.(gallery.map(img => img.url), i); }}
                    >
                      <img src={g.url} alt={`Part ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setGallery((prev) => prev.filter((_, j) => j !== i)); }}
                        className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {/* Add more */}
                  <div
                    className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted transition-colors ${
                      dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={`flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted transition-colors sm:h-44 ${
                    dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      <span className="mt-2 text-xs text-muted-foreground">{t('form.dropOrClick')}</span>
                    </>
                  )}
                </div>
              )}
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-2 flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="mr-1 h-3 w-3" />
                  {t('form.camera')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="mr-1 h-3 w-3" />
                  {t('form.upload')}
                </Button>
              </div>
              {gallery.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 w-full text-xs"
                  onClick={handleAiAnalyze}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  {t('form.aiAnalyze')}
                </Button>
              )}
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partNumber">{t('form.partNumber')}</Label>
                  <Input
                    id="partNumber"
                    name="partNumber"
                    placeholder={t('form.partNumberPlaceholder')}
                    defaultValue={part?.partNumber ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode">{t('form.barcode')}</Label>
                  <Input
                    id="barcode"
                    name="barcode"
                    placeholder={t('form.barcodePlaceholder')}
                    defaultValue={part?.barcode ?? initialBarcode ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">{t('form.nameLabel')}</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t('form.namePlaceholder')}
                    defaultValue={part?.name}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">{t('form.category')}</Label>
                  <Input
                    id="category"
                    name="category"
                    placeholder={t('form.categoryPlaceholder')}
                    defaultValue={part?.category ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">{t('form.location')}</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder={t('form.locationPlaceholder')}
                    defaultValue={part?.location ?? ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">{t('form.quantity')}</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={part?.quantity ?? 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minQuantity">{t('form.minQty')}</Label>
                  <Input
                    id="minQuantity"
                    name="minQuantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={part?.minQuantity ?? 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitCost">{t('form.unitCost')}</Label>
                  <Input
                    id="unitCost"
                    name="unitCost"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={part?.unitCost ?? 0}
                    onChange={(e) => {
                      if (!markupMultiplier || markupMultiplier <= 0) return;
                      const cost = Number(e.target.value) || 0;
                      const sellPriceInput = document.getElementById("sellPrice") as HTMLInputElement | null;
                      if (sellPriceInput && (!sellPriceInput.value || Number(sellPriceInput.value) === 0)) {
                        sellPriceInput.value = String(Math.round(cost * markupMultiplier * 100) / 100);
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sellPrice">{t('form.sellPrice')}</Label>
                  <Input
                    id="sellPrice"
                    name="sellPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={part?.sellPrice ?? 0}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">{t('form.supplier')}</Label>
              <Input
                id="supplier"
                name="supplier"
                placeholder={t('form.supplierPlaceholder')}
                defaultValue={part?.supplier ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierPhone">{t('form.supplierPhone')}</Label>
              <Input
                id="supplierPhone"
                name="supplierPhone"
                placeholder={t('form.supplierPhonePlaceholder')}
                defaultValue={part?.supplierPhone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierEmail">{t('form.supplierEmail')}</Label>
              <Input
                id="supplierEmail"
                name="supplierEmail"
                type="email"
                placeholder={t('form.supplierEmailPlaceholder')}
                defaultValue={part?.supplierEmail ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('form.description')}</Label>
            <Textarea
              id="description"
              name="description"
              placeholder={t('form.descriptionPlaceholder')}
              rows={3}
              defaultValue={part?.description ?? ""}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {part ? t('form.saveChanges') : t('form.addPart')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
