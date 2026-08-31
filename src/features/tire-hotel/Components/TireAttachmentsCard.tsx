'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/confirm-dialog'
import { useFormatDate } from '@/lib/use-format-date'
import { FileText, ImageIcon, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import {
  addTireSetAttachments,
  deleteTireSetAttachment,
  updateTireSetAttachment,
} from '../Actions/attachmentActions'

export type TireAttachment = {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  description: string | null
  includeInInvoice: boolean
  createdAt: Date
  uploadedBy: { id: string; name: string } | null
}

/**
 * Photos and documents held against a stored set.
 *
 * A kerbed rim is easier to show than to describe, and the argument about it
 * happens months later when the customer collects. A picture taken at
 * check-in, with a line of text saying what it shows, settles that.
 *
 * Each file carries whether it should reach the customer's invoice. On by
 * default, because a photo taken to be shown is usually taken to be shown,
 * and off for the ones that are the workshop's own record.
 */
export function TireAttachmentsCard({
  tireSetId,
  attachments,
}: {
  tireSetId: string
  attachments: TireAttachment[]
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const confirm = useConfirm()
  const { formatDate } = useFormatDate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Captions are edited in place, so the field holds what is being typed
  // rather than saving on every keystroke.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)

    // One request per file, so four rims appear one by one and a failure on
    // the fourth does not lose the first three.
    const uploaded: {
      fileName: string
      fileUrl: string
      fileType: string
      fileSize: number
    }[] = []
    let failed = 0

    for (const file of Array.from(files)) {
      const body = new FormData()
      body.append('file', file)
      try {
        const response = await fetch('/api/protected/upload/tire-hotel', {
          method: 'POST',
          body,
        })
        if (!response.ok) {
          failed += 1
          continue
        }
        const result = await response.json()
        uploaded.push({
          fileName: result.fileName,
          fileUrl: result.url,
          fileType: result.fileType,
          fileSize: result.fileSize,
        })
      } catch {
        failed += 1
      }
    }

    if (uploaded.length > 0) {
      const result = await addTireSetAttachments({ tireSetId, files: uploaded })
      if (!result.success) toast.error(result.error ?? t('files.failed'))
    }
    if (failed > 0) toast.error(t('files.someFailed', { count: failed }))

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  const saveCaption = async (id: string) => {
    const description = drafts[id]
    if (description === undefined) return
    setBusyId(id)
    const result = await updateTireSetAttachment({ id, description })
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('files.failed'))
      return
    }
    setDrafts((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    router.refresh()
  }

  const toggleInvoice = async (id: string, includeInInvoice: boolean) => {
    setBusyId(id)
    const result = await updateTireSetAttachment({ id, includeInInvoice })
    setBusyId(null)
    if (!result.success) toast.error(result.error ?? t('files.failed'))
    router.refresh()
  }

  const handleDelete = async (file: TireAttachment) => {
    const ok = await confirm({
      title: t('files.deleteTitle'),
      description: t('files.deleteBody', { name: file.fileName }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    setBusyId(file.id)
    const result = await deleteTireSetAttachment(file.id)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? t('files.failed'))
      return
    }
    router.refresh()
  }

  return (
    <AppCard
      icon={Paperclip}
      title={t('files.title')}
      badge={attachments.length > 0 ? attachments.length : undefined}
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t('files.add')}
        </Button>
      }
      contentClassName="space-y-3"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('files.none')}</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((file) => {
            const isImage = file.fileType.startsWith('image/')
            return (
              <li key={file.id} className="flex min-w-0 gap-3 rounded-lg border p-2">
                <a
                  href={file.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                  aria-label={file.fileName}
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.fileUrl}
                      alt={file.description || file.fileName}
                      className="h-16 w-16 rounded-md border object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted/40">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </span>
                  )}
                </a>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input
                    value={drafts[file.id] ?? file.description ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [file.id]: event.target.value }))
                    }
                    onBlur={() => saveCaption(file.id)}
                    placeholder={t('files.captionPlaceholder')}
                    className="h-8 text-sm"
                    disabled={busyId === file.id}
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {isImage ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={file.includeInInvoice}
                          onCheckedChange={(value) => toggleInvoice(file.id, value === true)}
                          disabled={busyId === file.id}
                        />
                        {t('files.onInvoice')}
                      </label>
                    ) : (
                      // Only photos travel onto a job when the set is billed,
                      // so a document must not offer a choice it cannot keep.
                      <span className="text-xs text-muted-foreground">
                        {t('files.documentStays')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(new Date(file.createdAt))}
                      {file.uploadedBy ? ` · ${file.uploadedBy.name}` : ''}
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 self-start p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(file)}
                  disabled={busyId === file.id}
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                >
                  {busyId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        {t('files.invoiceHint')}
      </p>
    </AppCard>
  )
}
