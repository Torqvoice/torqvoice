"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useGlassModal } from "@/components/glass-modal";
import { createInventoryPart, updateInventoryPart } from "../Actions/inventoryActions";
import { ExternalLink, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";

interface InventoryPartFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part?: {
    id: string;
    partNumber: string | null;
    name: string;
    description: string | null;
    category: string | null;
    quantity: number;
    minQuantity: number;
    unitCost: number;
    supplier: string | null;
    supplierPhone: string | null;
    supplierEmail: string | null;
    supplierUrl: string | null;
    imageUrl: string | null;
    location: string | null;
  };
}

export function InventoryPartForm({ open, onOpenChange, part }: InventoryPartFormProps) {
  const router = useRouter();
  const modal = useGlassModal();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [supplierUrl, setSupplierUrl] = useState(part?.supplierUrl ?? "");
  const [imageUrl, setImageUrl] = useState(part?.imageUrl ?? "");
  const [dragOver, setDragOver] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP, and AVIF images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    const toastId = toast.loading("Uploading image...");
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch("/api/upload/inventory", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not upload image", { id: toastId });
        return;
      }
      const { url } = await res.json();
      setImageUrl(url);
      toast.success("Image uploaded", { id: toastId });
    } catch {
      toast.error("Could not upload image", { id: toastId });
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
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
      const res = await fetch("/api/fetch-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        modal.open("error", "Fetch Failed", data.error || "Could not fetch metadata from URL");
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
      setIfEmpty("supplier", metadata.supplier);
      setIfEmpty("category", metadata.category);
      if (metadata.unitCost !== undefined) {
        const unitCostInput = form.elements.namedItem("unitCost") as HTMLInputElement | null;
        if (unitCostInput && (!unitCostInput.value || unitCostInput.value === "0")) {
          unitCostInput.value = String(metadata.unitCost);
        }
      }
      if (metadata.imageUrl && !imageUrl) {
        setImageUrl(metadata.imageUrl);
      }
    } catch {
      modal.open("error", "Fetch Failed", "Could not fetch metadata from URL");
    } finally {
      setFetching(false);
    }
  }, [supplierUrl, imageUrl, modal]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      partNumber: (formData.get("partNumber") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      category: (formData.get("category") as string) || undefined,
      quantity: Number(formData.get("quantity")) || 0,
      minQuantity: Number(formData.get("minQuantity")) || 0,
      unitCost: Number(formData.get("unitCost")) || 0,
      supplier: (formData.get("supplier") as string) || undefined,
      supplierPhone: (formData.get("supplierPhone") as string) || undefined,
      supplierEmail: (formData.get("supplierEmail") as string) || undefined,
      supplierUrl: supplierUrl || undefined,
      imageUrl: imageUrl || undefined,
      location: (formData.get("location") as string) || undefined,
    };

    const result = part
      ? await updateInventoryPart({ ...data, id: part.id })
      : await createInventoryPart(data);

    if (result.success) {
      onOpenChange(false);
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || "Failed to save part");
    }

    setLoading(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setSupplierUrl(part?.supplierUrl ?? "");
      setImageUrl(part?.imageUrl ?? "");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {part ? "Edit Part" : "Add New Part"}
          </DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier Link */}
          <div className="space-y-2">
            <Label htmlFor="supplierUrl">Supplier Link</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="supplierUrl"
                  placeholder="https://supplier.com/product/..."
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
                Fetch
              </Button>
            </div>
          </div>

          {/* Two-column layout: image left, fields right */}
          <div className="flex gap-5">
            {/* Image area */}
            <div className="flex-shrink-0 w-44">
              <Label className="mb-2 block">Image</Label>
              <div
                className={`relative h-44 w-44 overflow-hidden rounded-lg border-2 border-dashed bg-muted transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {imageUrl ? (
                  <>
                    <img
                      src={imageUrl}
                      alt="Part"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                  >
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <>
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs">Drop image or click</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-2 flex gap-1">
                {imageUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    Replace
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    Upload
                  </Button>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partNumber">Part Number</Label>
                  <Input
                    id="partNumber"
                    name="partNumber"
                    placeholder="BRK-001"
                    defaultValue={part?.partNumber ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Brake Pad Set"
                    defaultValue={part?.name}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    name="category"
                    placeholder="Brakes"
                    defaultValue={part?.category ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder="Shelf A-3"
                    defaultValue={part?.location ?? ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
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
                  <Label htmlFor="minQuantity">Min Quantity</Label>
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
                  <Label htmlFor="unitCost">Unit Cost</Label>
                  <Input
                    id="unitCost"
                    name="unitCost"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={part?.unitCost ?? 0}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                name="supplier"
                placeholder="AutoParts Inc."
                defaultValue={part?.supplier ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierPhone">Supplier Phone</Label>
              <Input
                id="supplierPhone"
                name="supplierPhone"
                placeholder="(555) 123-4567"
                defaultValue={part?.supplierPhone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierEmail">Supplier Email</Label>
              <Input
                id="supplierEmail"
                name="supplierEmail"
                type="email"
                placeholder="orders@autoparts.com"
                defaultValue={part?.supplierEmail ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Part description..."
              rows={3}
              defaultValue={part?.description ?? ""}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {part ? "Save Changes" : "Add Part"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
