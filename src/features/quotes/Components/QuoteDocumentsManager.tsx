"use client";

import { useState, useCallback, useRef } from "react";
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

interface QuoteDocumentsManagerProps {
  quoteId: string;
  initialDocuments: Attachment[];
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

export function QuoteDocumentsManager({
  quoteId,
  initialDocuments,
  maxDocuments,
}: QuoteDocumentsManagerProps) {
  const [files, setFiles] = useState<Attachment[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const atLimit = maxDocuments !== undefined && files.length >= maxDocuments;

  const handleUpload = useCallback(
    async (fileList: FileList | File[]) => {
      let fileArr = Array.from(fileList);
      if (maxDocuments !== undefined) {
        const remaining = maxDocuments - files.length;
        if (remaining <= 0) {
          toast.error(`Document limit reached (${files.length}/${maxDocuments}). Upgrade your plan for more.`);
          return;
        }
        if (fileArr.length > remaining) {
          fileArr = fileArr.slice(0, remaining);
          toast.warning(`Only uploading ${remaining} file${remaining > 1 ? "s" : ""} to stay within limit.`);
        }
      }
      setUploading(true);
      const toastId = toast.loading(
        `Uploading ${fileArr.length} file${fileArr.length > 1 ? "s" : ""}...`
      );
      let successCount = 0;

      for (const file of fileArr) {
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
              category: "document",
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
        toast.success(
          `${successCount} file${successCount > 1 ? "s" : ""} uploaded`,
          { id: toastId }
        );
      } else {
        toast.error("Upload failed", { id: toastId });
      }
      setUploading(false);
    },
    [quoteId, maxDocuments, files.length]
  );

  const handleDelete = useCallback(async (attachmentId: string) => {
    const result = await deleteQuoteAttachment(attachmentId);
    if (result.success) {
      setFiles((prev) => prev.filter((f) => f.id !== attachmentId));
      toast.success("File deleted");
    } else {
      toast.error(result.error || "Failed to delete file");
    }
  }, []);

  const handleToggleInvoice = useCallback(
    async (attachmentId: string, checked: boolean) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === attachmentId ? { ...f, includeInInvoice: checked } : f
        )
      );
      const result = await updateQuoteAttachment({
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
        toast.error(result.error || "Failed to update");
      }
    },
    []
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4" />
          Documents
          {maxDocuments !== undefined && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {files.length} / {maxDocuments}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {atLimit ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Document limit reached ({files.length}/{maxDocuments})
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upgrade your plan to upload more.
            </p>
          </div>
        ) : (
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
                : "Drop files here or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, CSV, TXT — max 10MB each
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.txt"
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
            Uploading documents...
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file) => (
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
                  PDF
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
        )}
      </CardContent>
    </Card>
  );
}
