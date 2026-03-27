"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Upload, Video, Send, X } from "lucide-react";
import { toast } from "sonner";
import { createStatusReport } from "../Actions/createStatusReport";

interface CreateStatusReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceRecordId: string;
  vehicleName: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    telegramChatId: string | null;
  } | null;
  smsEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  onCreated?: (reportId: string) => void;
}

export function CreateStatusReportDialog({
  open, onOpenChange, serviceRecordId, vehicleName, onCreated,
}: CreateStatusReportDialogProps) {
  const t = useTranslations("statusReport.create");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );

  useEffect(() => {
    if (open) {
      setTitle(""); setMessage(""); setVideoUrl(null); setVideoFileName(null);
      setUploading(false); setUploadProgress(0); setSubmitting(false);
      setExpiresAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
    }
  }, [open]);

  async function handleFileUpload(file: File) {
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const xhr = new XMLHttpRequest();
      const result = await new Promise<{ url: string; fileName: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(t("uploadFailed")));
        });
        xhr.addEventListener("error", () => reject(new Error(t("uploadFailed"))));
        xhr.open("POST", "/api/protected/upload/service-files");
        xhr.send(formData);
      });
      setVideoUrl(result.url);
      setVideoFileName(result.fileName);
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("video/")) handleFileUpload(file);
  }

  async function handleSubmit(andSend: boolean) {
    if (!videoUrl) { toast.error(t("noVideo")); return; }
    setSubmitting(true);
    try {
      const result = await createStatusReport({
        serviceRecordId,
        title: title || undefined,
        message: message || undefined,
        videoUrl,
        videoFileName: videoFileName || undefined,
        expiresAt,
      });
      if (!result.success || !result.data) {
        toast.error(result.error || "Failed to create status report");
        return;
      }
      toast.success(t("created"));
      onOpenChange(false);
      if (andSend && onCreated) onCreated(result.data.id);
    } catch {
      toast.error("Failed to create status report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{vehicleName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {videoUrl ? (
            <div className="relative overflow-hidden rounded-lg border">
              <video src={videoUrl} controls preload="metadata" playsInline className="w-full max-h-56" />
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{videoFileName}</span>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => { setVideoUrl(null); setVideoFileName(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : uploading ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8">
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground/50" />
              <p className="text-sm font-medium">{t("uploading")} {uploadProgress}%</p>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-muted-foreground/50"
            >
              <Video className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => captureInputRef.current?.click()}>
                  <Camera className="mr-1.5 h-4 w-4" />
                  {t("record")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-1.5 h-4 w-4" />
                  {t("uploadFile")}
                </Button>
              </div>
              <input ref={captureInputRef} type="file" accept="video/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f); e.target.value = ""; } }} />
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFileUpload(f); e.target.value = ""; } }} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sr-title">{t("titleLabel")}</Label>
            <Input id="sr-title" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-message">{t("messageLabel")}</Label>
            <Textarea id="sr-message" value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePlaceholder")} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr-expires">{t("expiresLabel")}</Label>
            <Input
              id="sr-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={submitting || uploading}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("create")}
          </Button>
          {onCreated && (
            <Button onClick={() => handleSubmit(true)} disabled={submitting || uploading}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t("createAndSend")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
