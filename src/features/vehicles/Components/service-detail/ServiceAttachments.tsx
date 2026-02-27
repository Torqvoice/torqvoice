'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Camera,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Play,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { formatFileSize } from './types'
import type { Attachment } from './types'

function getFileIcon(type: string) {
  if (type === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />
  if (type.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-blue-500" />
  return <Paperclip className="h-5 w-5 text-muted-foreground" />
}

function AttachmentRow({
  attachment,
  onDelete,
  deleting,
}: {
  attachment: Attachment
  onDelete: (id: string) => void
  deleting: boolean
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded border p-2">
      <div className="flex h-8 w-8 items-center justify-center rounded bg-muted/50">
        {getFileIcon(attachment.fileType)}
      </div>
      <div className="overflow-hidden">
        <p className="truncate text-xs font-medium" title={attachment.fileName}>
          {attachment.fileName}
        </p>
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
  )
}

interface ServiceAttachmentsProps {
  attachments: Attachment[]
  imageAttachments: Attachment[]
  onImageClick: (index: number) => void
  onDeleteAttachment: (id: string) => void
  deletingAttachment: string | null
}

export function ServiceAttachments({
  attachments,
  imageAttachments,
  onImageClick,
  onDeleteAttachment,
  deletingAttachment,
}: ServiceAttachmentsProps) {
  const t = useTranslations('service.attachments')
  const diagnostics = attachments.filter((a) => a.category === 'diagnostic')
  const documents = attachments.filter((a) => a.category === 'document')
  const videos = attachments.filter((a) => a.category === 'video')
  const [activeVideo, setActiveVideo] = useState<Attachment | null>(null)

  return (
    <>
      {imageAttachments.length > 0 && (
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-3.5 w-3.5" />
            {t('images', { count: imageAttachments.length })}
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
                      {deletingAttachment === attachment.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-2.5 w-2.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Video className="h-3.5 w-3.5" />
            {t('videos', { count: videos.length })}
          </h3>
          <div className="space-y-1.5">
            {videos.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded border p-2"
              >
                <button
                  type="button"
                  onClick={() => setActiveVideo(a)}
                  className="flex h-8 w-8 items-center justify-center rounded bg-muted/50 transition-colors hover:bg-muted"
                >
                  <Play className="h-4 w-4 text-primary" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVideo(a)}
                  className="overflow-hidden text-left"
                >
                  <p className="truncate text-xs font-medium" title={a.fileName}>
                    {a.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(a.fileSize)}</p>
                </button>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                    <a href={a.fileUrl} download={a.fileName}>
                      <Download className="h-3 w-3" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    disabled={deletingAttachment === a.id}
                    onClick={() => onDeleteAttachment(a.id)}
                  >
                    {deletingAttachment === a.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-3.5 w-3.5" />
            {t('diagnostics', { count: diagnostics.length })}
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
        <div className="min-w-0 overflow-hidden rounded-lg border p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-3.5 w-3.5" />
            {t('documents', { count: documents.length })}
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

      {/* Fullscreen video player */}
      {activeVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setActiveVideo(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 h-10 w-10 text-white hover:bg-white/10"
            onClick={() => setActiveVideo(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          <video
            src={activeVideo.fileUrl}
            controls
            autoPlay
            className="max-h-[90vh] max-w-[90vw] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
