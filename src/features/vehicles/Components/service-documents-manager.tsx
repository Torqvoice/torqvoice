"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
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

interface ServiceDocumentsManagerProps {
  serviceRecordId: string;
  initialDocuments: Attachment[];
  maxDiagnostics?: number;
  maxDocuments?: number;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type === "application/pdf")
    return <FileText className="h-4 w-4 text-red-500" />;
  if (type.startsWith("image/"))
    return <ImageIcon className="h-4 w-4 text-blue-500" />;
  return <Paperclip className="h-4 w-4 text-muted-foreground" />;
}

export function ServiceDocumentsManager({
  serviceRecordId,
  initialDocuments,
  maxDiagnostics,
  maxDocuments,
}: ServiceDocumentsManagerProps) {
  const t = useTranslations("service");
  const [files, setFiles] = useState<Attachment[]>(initialDocuments);
  const [uploadingReports, setUploadingReports] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const reportInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const diagnosticReports = files.filter((f) => f.category === "diagnostic");
  const documents = files.filter((f) => f.category === "document");
  const diagnosticsAtLimit = maxDiagnostics !== undefined && diagnosticReports.length >= maxDiagnostics;
  const documentsAtLimit = maxDocuments !== undefined && documents.length >= maxDocuments;

  const handleUpload = useCallback(
    async (
      fileList: FileList | File[],
      category: "diagnostic" | "document"
    ) => {
      const maxLimit = category === "diagnostic" ? maxDiagnostics : maxDocuments;
      const currentItems = category === "diagnostic" ? diagnosticReports : documents;
      let fileArr = Array.from(fileList);
      if (maxLimit !== undefined) {
        const remaining = maxLimit - currentItems.length;
        if (remaining <= 0) {
          const label = category === "diagnostic" ? t("documents.diagnosticLabel") : t("documents.documentLabel");
          toast.error(t("documents.limitReachedToast", { label, count: currentItems.length, max: maxLimit }));
          return;
        }
        if (fileArr.length > remaining) {
          fileArr = fileArr.slice(0, remaining);
          toast.warning(t("documents.onlyUploading", { count: remaining }));
        }
      }
      const setUploading =
        category === "diagnostic" ? setUploadingReports : setUploadingDocuments;
      setUploading(true);
      const toastId = toast.loading(t("documents.uploadingCount", { count: fileArr.length }));
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
              category,
              includeInInvoice: true,
            },
          });

          if (result.success && result.data) {
            setFiles((prev) => [...prev, result.data as Attachment]);
            successCount++;
          } else {
            toast.error(result.error || `Failed to save ${file.name}`);
          }
        } catch {
          toast.error(`Failed to upload ${file.name}`);
        }
      }

      if (successCount > 0) {
        toast.success(t("documents.uploadedCount", { count: successCount }), { id: toastId });
      } else {
        toast.error(t("documents.uploadFailed"), { id: toastId });
      }
      setUploading(false);
    },
    [serviceRecordId, maxDiagnostics, maxDocuments, diagnosticReports, documents, t]
  );

  const handleDelete = useCallback(async (attachmentId: string) => {
    const result = await deleteServiceAttachment(attachmentId);
    if (result.success) {
      setFiles((prev) => prev.filter((f) => f.id !== attachmentId));
      toast.success(t("documents.deleted"));
    } else {
      toast.error(result.error || t("documents.failedDelete"));
    }
  }, [t]);

  const handleToggleInvoice = useCallback(
    async (attachmentId: string, checked: boolean) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === attachmentId ? { ...f, includeInInvoice: checked } : f
        )
      );
      const result = await updateServiceAttachment({
        id: attachmentId,
        includeInInvoice: checked,
      });
      if (!result.success) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === attachmentId
              ? { ...f, includeInInvoice: !checked }
              : f
          )
        );
        toast.error(result.error || t("documents.failedUpdate"));
      }
    },
    [t]
  );

  const renderFileList = (items: Attachment[]) =>
    items.length > 0 && (
      <div className="space-y-2">
        {items.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-3 rounded-md border p-2.5"
          >
            {getFileIcon(file.fileType)}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.fileSize)}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={file.includeInInvoice}
                onCheckedChange={(checked) =>
                  handleToggleInvoice(file.id, checked)
                }
                className="scale-75"
              />
              {t("documents.invoice")}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(file.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Diagnostic Reports */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            {t("documents.diagnosticTitle")}
            {maxDiagnostics !== undefined && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {diagnosticReports.length} / {maxDiagnostics}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {diagnosticsAtLimit ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
              <p className="text-sm font-medium text-muted-foreground">
                {t("documents.diagnosticLimitReached", { count: diagnosticReports.length, max: maxDiagnostics })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("documents.upgradePrompt")}
              </p>
            </div>
          ) : (
            <div
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length > 0)
                  handleUpload(e.dataTransfer.files, "diagnostic");
              }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => reportInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-muted-foreground/50"
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {uploadingReports ? t("documents.uploading") : t("documents.dropzone")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("documents.diagnosticFormats")}
              </p>
              <input
                ref={reportInputRef}
                type="file"
                multiple
                accept=".pdf,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUpload(e.target.files, "diagnostic");
                    e.target.value = "";
                  }
                }}
              />
            </div>
          )}

          {uploadingReports && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("documents.uploadingReports")}
            </div>
          )}

          {renderFileList(diagnosticReports)}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            {t("documents.documentsTitle")}
            {maxDocuments !== undefined && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {documents.length} / {maxDocuments}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {documentsAtLimit ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
              <p className="text-sm font-medium text-muted-foreground">
                {t("documents.documentLimitReached", { count: documents.length, max: maxDocuments })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("documents.upgradePrompt")}
              </p>
            </div>
          ) : (
            <div
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length > 0)
                  handleUpload(e.dataTransfer.files, "document");
              }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => documentInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 transition-colors hover:border-muted-foreground/50"
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {uploadingDocuments ? t("documents.uploading") : t("documents.dropzone")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("documents.documentFormats")}
              </p>
              <input
                ref={documentInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUpload(e.target.files, "document");
                    e.target.value = "";
                  }
                }}
              />
            </div>
          )}

          {uploadingDocuments && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("documents.uploadingDocuments")}
            </div>
          )}

          {renderFileList(documents)}
        </CardContent>
      </Card>
    </div>
  );
}
