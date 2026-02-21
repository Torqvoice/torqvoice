"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Film, Loader2, Upload, X } from "lucide-react";
import { addServiceAttachment } from "@/features/vehicles/Actions/addServiceAttachment";
import { updateServiceAttachment } from "@/features/vehicles/Actions/updateServiceAttachment";
import { deleteServiceAttachment } from "@/features/vehicles/Actions/serviceActions";

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

interface ServiceVideoManagerProps {
  serviceRecordId: string;
  initialVideos: Attachment[];
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ServiceVideoManager({
  serviceRecordId,
  initialVideos,
}: ServiceVideoManagerProps) {
  const [videos, setVideos] = useState<Attachment[]>(initialVideos);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (fileList: FileList | File[]) => {
      setUploading(true);
      const fileArr = Array.from(fileList);
      const toastId = toast.loading(
        `Uploading ${fileArr.length} video${fileArr.length > 1 ? "s" : ""}...`
      );
      let successCount = 0;

      for (const file of fileArr) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/protected/upload/service-files", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const err = await res.json();
            toast.error(err.error || `Failed to upload ${file.name}`);
            continue;
          }
          const data = await res.json();

          const result = await addServiceAttachment({
            serviceRecordId,
            attachment: {
              fileName: data.fileName,
              fileUrl: data.url,
              fileType: data.fileType,
              fileSize: data.fileSize,
              category: "video",
              includeInInvoice: true,
            },
          });

          if (result.success && result.data) {
            setVideos((prev) => [...prev, result.data as Attachment]);
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
          `${successCount} video${successCount > 1 ? "s" : ""} uploaded`,
          { id: toastId }
        );
      } else {
        toast.error("Upload failed", { id: toastId });
      }
      setUploading(false);
    },
    [serviceRecordId]
  );

  const handleDelete = useCallback(async (attachmentId: string) => {
    const result = await deleteServiceAttachment(attachmentId);
    if (result.success) {
      setVideos((prev) => prev.filter((v) => v.id !== attachmentId));
      toast.success("Video deleted");
    } else {
      toast.error(result.error || "Failed to delete video");
    }
  }, []);

  const handleToggleInvoice = useCallback(
    async (attachmentId: string, checked: boolean) => {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === attachmentId ? { ...v, includeInInvoice: checked } : v
        )
      );
      const result = await updateServiceAttachment({
        id: attachmentId,
        includeInInvoice: checked,
      });
      if (!result.success) {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === attachmentId
              ? { ...v, includeInInvoice: !checked }
              : v
          )
        );
        toast.error(result.error || "Failed to update");
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Film className="h-4 w-4" />
            Service Videos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length > 0)
                handleUpload(e.dataTransfer.files);
            }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-muted-foreground/50"
          >
            <Upload className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {uploading
                ? "Uploading..."
                : "Drop videos here or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              MP4, WebM, MOV — max 10MB each
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading videos...
            </div>
          )}

          {videos.length > 0 && (
            <div className="space-y-4">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="overflow-hidden rounded-md border"
                >
                  <video
                    src={video.fileUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full max-h-80"
                  />
                  <div className="flex items-center gap-3 p-2.5">
                    <Film className="h-4 w-4 shrink-0 text-purple-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {video.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(video.fileSize)}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={video.includeInInvoice}
                        onCheckedChange={(checked) =>
                          handleToggleInvoice(video.id, checked)
                        }
                        className="scale-75"
                      />
                      Invoice
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(video.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
