'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Film, ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addServiceAttachment } from '@/features/vehicles/Actions/addServiceAttachment'
import { compressImage } from '@/lib/compress-image'

export interface ConcernMediaFile {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  concernId?: string | null
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Photos and video filed under one concern: the cracked coil, the cold start
 * that shakes. They are ordinary job files, uploaded the way the Files & media
 * card uploads them and listed there as well; what this adds is which concern
 * they are evidence for, so the story and its pictures stay together.
 *
 * It lives inside the work order form without being part of it. A file is
 * saved the moment it is chosen, so choosing one must not mark the job as
 * having unsaved changes; the input event stops here.
 */
export function ConcernMedia({
  serviceRecordId,
  concernId,
  files,
}: {
  serviceRecordId: string
  concernId: string
  files: ConcernMediaFile[]
}) {
  const t = useTranslations('service.concerns')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (list: FileList) => {
    const chosen = Array.from(list).filter(
      (file) => IMAGE_TYPES.includes(file.type) || file.type.startsWith('video/')
    )
    if (chosen.length === 0) {
      toast.error(t('mediaTypes'))
      return
    }
    setUploading(true)
    let added = 0
    for (let file of chosen) {
      const isImage = IMAGE_TYPES.includes(file.type)
      try {
        if (isImage) file = await compressImage(file)
        const body = new FormData()
        body.append('file', file)
        const res = await fetch('/api/protected/upload/service-files', { method: 'POST', body })
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          toast.error(err?.error || t('mediaFailed', { name: file.name }))
          continue
        }
        const data = await res.json()
        const result = await addServiceAttachment({
          serviceRecordId,
          concernId,
          attachment: {
            fileName: data.fileName,
            fileUrl: data.url,
            fileType: data.fileType,
            fileSize: data.fileSize,
            category: isImage ? 'image' : 'video',
            includeInInvoice: isImage,
          },
        })
        if (result.success) added++
        else toast.error(result.error || t('mediaFailed', { name: file.name }))
      } catch {
        toast.error(t('mediaFailed', { name: file.name }))
      }
    }
    setUploading(false)
    if (added > 0) {
      toast.success(t('mediaAdded', { count: added }))
      // The thumbnails, and the Files & media card, are drawn from the record.
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" onInput={(e) => e.stopPropagation()}>
      {files.map((file) => (
        <a
          key={file.id}
          href={file.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={file.fileName}
          className="block h-12 w-12 shrink-0 overflow-hidden rounded-md border border-card-edge bg-muted transition-colors hover:border-primary"
        >
          {file.fileType.startsWith('image/') ? (
            <img src={file.fileUrl} alt={file.fileName} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Film className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{file.fileName}</span>
            </span>
          )}
        </a>
      ))}
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        data-testid="concern-add-media"
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImagePlus className="h-3 w-3" />
        )}
        {uploading ? t('mediaUploading') : t('addMedia')}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
