"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";
import { addQuoteAttachment } from "@/features/quotes/Actions/addQuoteAttachment";
import { updateQuoteAttachment } from "@/features/quotes/Actions/updateQuoteAttachment";
import { deleteQuoteAttachment } from "@/features/quotes/Actions/deleteQuoteAttachment";

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: string;
  description: string | null;
  includeInInvoice: boolean;
}

interface QuoteImagesManagerProps {
  quoteId: string;
  initialImages: Attachment[];
  maxImages?: number;
}

export function QuoteImagesManager({
  quoteId,
  initialImages,
  maxImages,
}: QuoteImagesManagerProps) {
  const [images, setImages] = useState<Attachment[]>(initialImages);
  const atLimit = maxImages !== undefined && images.length >= maxImages;
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      let fileArr = Array.from(files);
      const rejected = fileArr.filter((f) => !allowedTypes.includes(f.type));
      if (rejected.length > 0) {
        toast.error(
          `Only JPG, PNG, and WebP images are allowed. ${rejected.map((f) => f.name).join(", ")} skipped.`
        );
        fileArr = fileArr.filter((f) => allowedTypes.includes(f.type));
        if (fileArr.length === 0) return;
      }
      if (maxImages !== undefined) {
        const remaining = maxImages - images.length;
        if (remaining <= 0) {
          toast.error(`Image limit reached (${images.length}/${maxImages}). Upgrade your plan for more.`);
          return;
        }
        if (fileArr.length > remaining) {
          fileArr = fileArr.slice(0, remaining);
          toast.warning(`Only uploading ${remaining} image${remaining > 1 ? "s" : ""} to stay within limit.`);
        }
      }
      setUploading(true);
      const toastId = toast.loading(
        `Uploading ${fileArr.length} image${fileArr.length > 1 ? "s" : ""}...`
      );
      let successCount = 0;

      for (let file of fileArr) {
        if (file.type.startsWith("image/")) {
          file = await compressImage(file);
        }
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/protected/upload/quote-files", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const err = await res.json();
            toast.error(err.error || `Failed to upload ${file.name}`);
            continue;
          }
          const data = await res.json();

          const result = await addQuoteAttachment({
            quoteId,
            attachment: {
              fileName: data.fileName,
              fileUrl: data.url,
              fileType: data.fileType,
              fileSize: data.fileSize,
              category: "image",
              includeInInvoice: true,
            },
          });

          if (result.success && result.data) {
            setImages((prev) => [...prev, result.data as Attachment]);
            successCount++;
          } else {
            toast.error(result.error || `Failed to save ${file.name}`);
          }
        } catch {
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      if (successCount > 0) {
        toast.success(
          `${successCount} image${successCount > 1 ? "s" : ""} uploaded`,
          { id: toastId }
        );
      } else {
        toast.error("Upload failed", { id: toastId });
      }
      setUploading(false);
    },
    [quoteId, maxImages, images.length]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [handleUpload]
  );

  const handleDelete = useCallback(async (attachmentId: string) => {
    const result = await deleteQuoteAttachment(attachmentId);
    if (result.success) {
      setImages((prev) => prev.filter((img) => img.id !== attachmentId));
      toast.success("Image deleted");
    } else {
      toast.error(result.error || "Failed to delete image");
    }
  }, []);

  const handleToggleInvoice = useCallback(
    async (attachmentId: string, checked: boolean) => {
      setImages((prev) =>
        prev.map((img) =>
          img.id === attachmentId ? { ...img, includeInInvoice: checked } : img
        )
      );
      const result = await updateQuoteAttachment({
        id: attachmentId,
        includeInInvoice: checked,
      });
      if (!result.success) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === attachmentId
              ? { ...img, includeInInvoice: !checked }
              : img
          )
        );
        toast.error(result.error || "Failed to update");
      }
    },
    []
  );

  const handleDescriptionChange = useCallback(
    async (attachmentId: string, description: string) => {
      setImages((prev) =>
        prev.map((img) =>
          img.id === attachmentId ? { ...img, description } : img
        )
      );
    },
    []
  );

  const handleDescriptionBlur = useCallback(
    async (attachmentId: string, description: string) => {
      await updateQuoteAttachment({ id: attachmentId, description });
    },
    []
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" />
          Quote Images
          {maxImages !== undefined && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {images.length} / {maxImages}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {atLimit ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Image limit reached ({images.length}/{maxImages})
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upgrade your plan to upload more images.
            </p>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-muted-foreground/50"
          >
            <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Drop images here or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WebP — max 10MB each
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading images...
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {images.map((file) => (
              <div key={file.id} className="group overflow-hidden rounded-lg border">
                <div className="relative">
                  <img
                    src={file.fileUrl}
                    alt={file.description || file.fileName}
                    className="aspect-square w-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => handleDelete(file.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-1 p-1.5">
                  <Input
                    placeholder="Description..."
                    value={file.description || ""}
                    onChange={(e) =>
                      handleDescriptionChange(file.id, e.target.value)
                    }
                    onBlur={(e) =>
                      handleDescriptionBlur(file.id, e.target.value)
                    }
                    className="h-7 text-xs"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={file.includeInInvoice}
                      onCheckedChange={(checked) =>
                        handleToggleInvoice(file.id, checked)
                      }
                      className="scale-75"
                    />
                    PDF
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
