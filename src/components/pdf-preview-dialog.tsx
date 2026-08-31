'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface PdfPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Endpoint that answers the finished PDF, e.g. /api/protected/services/[id]/pdf */
  url: string
}

/**
 * Shows the document's real PDF in a dialog, next to the download button.
 *
 * The file is fetched fresh on every open rather than cached, so the preview
 * always matches what download, email, and share would produce right now —
 * which is the whole point of looking before sending.
 */
export function PdfPreviewDialog({ open, onOpenChange, url }: PdfPreviewDialogProps) {
  const t = useTranslations('common.pdfPreview')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let created: string | null = null
    setBlobUrl(null)
    setFailed(false)

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed')
        const blob = await res.blob()
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setBlobUrl(created)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [open, url])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted">
          {failed ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t('failed')}
            </div>
          ) : blobUrl ? (
            <iframe src={blobUrl} title={t('title')} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
