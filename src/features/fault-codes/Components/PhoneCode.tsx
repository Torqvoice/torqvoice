'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'
import { createFixPhoneLink } from '../Actions/createFixPhoneLink'
import { listFixDraftPhotos } from '../Actions/listFixDraftPhotos'
import { removeFixDraftPhoto } from '../Actions/removeFixDraftPhoto'

const POLL_MS = 2500

/** A v4 UUID, also where `crypto.randomUUID` is missing (plain http on a LAN). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export type PhoneLink = { url: string; expiresAt: Date }
export type PhonePhoto = { id: string; url: string }

/**
 * Photos taken with a phone for a draft on the computer: while `active`, a fresh code for the
 * phone (the last may have lapsed), and the photos as they land. A waveform's code asks the
 * phone for one picture of the scope screen; a fix's for up to four photos.
 */
export function usePhoneDraft({
  active,
  code,
  draftId,
  purpose,
}: {
  active: boolean
  code: string
  draftId: string
  purpose: 'fix' | 'waveform'
}) {
  const [link, setLink] = useState<PhoneLink | null>(null)
  const [failed, setFailed] = useState(false)
  const [photos, setPhotos] = useState<PhonePhoto[]>([])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLink(null)
    setFailed(false)
    createFixPhoneLink({ code, draftId, purpose })
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setFailed(true)
          return
        }
        setLink({
          url: `${window.location.origin}/p/${result.data.token}`,
          expiresAt: new Date(result.data.expiresAt),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [active, code, draftId, purpose])

  useEffect(() => {
    if (!active) return
    const read = async () => {
      const result = await listFixDraftPhotos({ draftId }).catch(() => null)
      if (result?.success && result.data) setPhotos(result.data)
    }
    void read()
    const timer = setInterval(read, POLL_MS)
    return () => clearInterval(timer)
  }, [active, draftId])

  const remove = async (photoId: string) => {
    setPhotos((current) => current.filter((p) => p.id !== photoId))
    await removeFixDraftPhoto({ draftId, photoId }).catch(() => null)
  }

  return { link, failed, photos, setPhotos, remove }
}

/** The code to scan, how long it works, a link to copy, and what has arrived so far. */
export function PhoneCodePanel({
  link,
  failed,
  title,
  body,
  received,
}: {
  link: PhoneLink | null
  failed: boolean
  title: string
  body: string
  /** "2 photos from your phone", once there are some. */
  received?: string | null
}) {
  const t = useTranslations('faultCodes.share.phone')
  const { formatTime } = useFormatDate()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-card-edge bg-muted/30 p-4 sm:flex-row sm:items-start">
      <div className="flex size-[164px] shrink-0 items-center justify-center rounded-lg bg-white p-2 shadow-sm">
        {link ? (
          <QRCodeSVG value={link.url} size={148} marginSize={0} />
        ) : failed ? (
          <X className="size-6 text-muted-foreground" aria-hidden />
        ) : (
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{failed ? t('failed') : body}</p>
        {link && (
          <>
            <p className="text-xs text-muted-foreground">
              {t('expires', { time: formatTime(link.expiresAt) })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(link.url)
                setCopied(true)
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? t('copied') : t('copy')}
            </Button>
          </>
        )}
        {received && (
          <p className="text-xs font-medium text-primary" aria-live="polite">
            {received}
          </p>
        )}
      </div>
    </div>
  )
}
