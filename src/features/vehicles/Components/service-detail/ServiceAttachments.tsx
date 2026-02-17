"use client";

import { Button } from "@/components/ui/button";
import {
  Camera,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
} from "lucide-react";
import { formatFileSize } from "./types";
import type { Attachment } from "./types";

function getFileIcon(type: string) {
  if (type === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-blue-500" />;
  return <Paperclip className="h-5 w-5 text-muted-foreground" />;
}

function AttachmentRow({
  attachment,
  onDelete,
  deleting,
}: {
  attachment: Attachment;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded border p-2">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-muted/50">
        {getFileIcon(attachment.fileType)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</p>
      </div>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
          <a href={attachment.fileUrl} download={attachment.fileName}>
            <Download className="h-3 w-3" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          disabled={deleting}
          onClick={() => onDelete(attachment.id)}
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

interface ServiceAttachmentsProps {
  attachments: Attachment[];
  imageAttachments: Attachment[];
  onImageClick: (index: number) => void;
  onDeleteAttachment: (id: string) => void;
  deletingAttachment: string | null;
}

export function ServiceAttachments({
  attachments,
  imageAttachments,
  onImageClick,
  onDeleteAttachment,
  deletingAttachment,
}: ServiceAttachmentsProps) {
  const diagnostics = attachments.filter((a) => a.category === "diagnostic");
  const documents = attachments.filter((a) => a.category === "document");

  return (
    <>
      {imageAttachments.length > 0 && (
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-3.5 w-3.5" />
            Images ({imageAttachments.length})
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {imageAttachments.map((attachment, idx) => (
              <div key={attachment.id} className="group overflow-hidden rounded border">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => onImageClick(idx)}
                    className="block w-full cursor-zoom-in"
                  >
                    <img
                      src={attachment.fileUrl}
                      alt={attachment.description || attachment.fileName}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                  <div className="absolute right-0.5 top-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="secondary" size="icon" className="h-5 w-5" asChild>
                      <a href={attachment.fileUrl} download={attachment.fileName}>
                        <Download className="h-2.5 w-2.5" />
                      </a>
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-5 w-5 hover:text-destructive"
                      disabled={deletingAttachment === attachment.id}
                      onClick={() => onDeleteAttachment(attachment.id)}
                    >
                      {deletingAttachment === attachment.id
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        : <Trash2 className="h-2.5 w-2.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-3.5 w-3.5" />
            Diagnostic Reports ({diagnostics.length})
          </h3>
          <div className="space-y-1.5">
            {diagnostics.map((a) => (
              <AttachmentRow
                key={a.id}
                attachment={a}
                onDelete={onDeleteAttachment}
                deleting={deletingAttachment === a.id}
              />
            ))}
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-3.5 w-3.5" />
            Documents ({documents.length})
          </h3>
          <div className="space-y-1.5">
            {documents.map((a) => (
              <AttachmentRow
                key={a.id}
                attachment={a}
                onDelete={onDeleteAttachment}
                deleting={deletingAttachment === a.id}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
