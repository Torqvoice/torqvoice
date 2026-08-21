'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, MessageCircle } from 'lucide-react'
import { isWhatsappReady, sendWhatsappToCustomer } from '../Actions/whatsappActions'

/**
 * Sends one photo straight to the customer on WhatsApp.
 *
 * This is the whole point of the integration for a workshop: a mechanic has
 * the seized caliper in front of them, photographs it, and the customer sees
 * it before anyone has to explain it over the phone.
 */
export function SendPhotoToWhatsapp({
  customerId,
  fileUrl,
  fileName,
  serviceRecordId,
}: {
  customerId: string
  fileUrl: string
  fileName: string
  serviceRecordId?: string
}) {
  const t = useTranslations('whatsapp.sendPhoto')
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [isSending, startSending] = useTransition()

  useEffect(() => {
    let active = true
    isWhatsappReady().then((result) => {
      if (active) setAvailable(result.success && result.data === true)
    })
    return () => {
      active = false
    }
  }, [])

  // Nothing to offer when the workshop has no WhatsApp number: an action that
  // only ever errors is worse than no action.
  if (!available) return null

  const handleSend = () => {
    startSending(async () => {
      const result = await sendWhatsappToCustomer({
        customerId,
        body: caption.trim() || undefined,
        mediaUrl: fileUrl,
        mediaType: 'image',
        mediaFilename: fileName,
        relatedEntityType: serviceRecordId ? 'ServiceRecord' : undefined,
        relatedEntityId: serviceRecordId,
      })

      if (!result.success) {
        toast.error(result.error ?? t('failed'))
        return
      }
      toast.success(result.data?.usedTemplate ? t('sentAsTemplate') : t('sent'))
      setCaption('')
      setOpen(false)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title={t('action')}
        aria-label={t('action')}
      >
        <MessageCircle className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="overflow-hidden rounded-lg border">
            <Image
              src={fileUrl}
              alt={fileName}
              width={400}
              height={300}
              unoptimized
              className="h-auto w-full object-cover"
            />
          </div>

          <Textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder={t('captionPlaceholder')}
            rows={3}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" onClick={handleSend} disabled={isSending}>
              {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
