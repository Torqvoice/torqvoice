'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, ImagePlus, Loader2, Send, Smartphone, X } from 'lucide-react'
import { toast } from 'sonner'
import { useServiceType } from '@/components/service-type-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { compressImage } from '@/lib/compress-image'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { RichTextEditor } from '@/features/vehicles/Components/service-edit/RichTextEditor'
import { createFixPhoneLink } from '../Actions/createFixPhoneLink'
import { listFixDraftPhotos } from '../Actions/listFixDraftPhotos'
import { removeFixDraftPhoto } from '../Actions/removeFixDraftPhoto'
import { htmlToFixMarkdown } from '../Lib/fixMarkdown'
import type { CodeVehicle, OwnFix } from '../Lib/types'
import {
  FIX_PHOTO_TYPES,
  MAX_FIX_PHOTO_BYTES,
  MAX_FIX_PHOTOS,
  MAX_FIX_TEXT,
} from '../Schema/faultCodeSchema'
import { fixVehicleLine } from './FixPhotos'

const SHARE_URL = '/api/protected/fault-codes/fixes'
const POLL_MS = 2500

type Picked = { file: File; url: string }
type ShareReply = { success: true; data: OwnFix } | { success: false; error?: string }
const FAILURES = ['photo', 'too_large', 'paused', 'demo'] as const
type Failure = (typeof FAILURES)[number]

/** A v4 UUID, also where `crypto.randomUUID` is missing (plain http on a LAN). */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Writing a fix for other workshops: what fixed the code in the
 * technician's own words, with the notes editor, and up to four photos,
 * picked or dropped here or taken with a phone through a code. Phone photos
 * wait in a draft on the server and go with the fix when it is shared.
 * What was typed stays when the dialog is closed, until it is shared.
 */
export function ShareFixDialog({
  open,
  onOpenChange,
  code,
  vehicle,
  onShared,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: string
  vehicle: CodeVehicle | null
  onShared: (fix: OwnFix) => void
}) {
  const t = useTranslations('faultCodes.share')
  const locale = useLocale()
  const isMarine = useServiceType() === 'marine'
  const { formatTime } = useFormatDate()
  const [html, setHtml] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [phone, setPhone] = useState<{ id: string; url: string }[]>([])
  const [draftId, setDraftId] = useState(uuid)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [link, setLink] = useState<{ url: string; expiresAt: Date } | null>(null)
  const [linkFailed, setLinkFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [adding, setAdding] = useState(false)
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  useEffect(() => {
    const held = urls.current
    return () => {
      for (const url of held) URL.revokeObjectURL(url)
    }
  }, [])

  const markdown = html ? htmlToFixMarkdown(html) : ''
  const tooLong = markdown.length > MAX_FIX_TEXT
  const photoCount = picked.length + phone.length
  const tooManyPhotos = photoCount > MAX_FIX_PHOTOS
  const room = Math.max(0, MAX_FIX_PHOTOS - photoCount)

  // A fresh phone code each time the panel opens; the last may have lapsed.
  useEffect(() => {
    if (!open || !phoneOpen) return
    let cancelled = false
    setLink(null)
    setLinkFailed(false)
    createFixPhoneLink({ code, draftId })
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setLinkFailed(true)
          return
        }
        setLink({
          url: `${window.location.origin}/p/${result.data.token}`,
          expiresAt: new Date(result.data.expiresAt),
        })
      })
      .catch(() => {
        if (!cancelled) setLinkFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, phoneOpen, code, draftId])

  // Phone photos show here as they land, while the code is up.
  useEffect(() => {
    if (!open || !phoneOpen) return
    const read = async () => {
      const result = await listFixDraftPhotos({ draftId }).catch(() => null)
      if (result?.success && result.data) setPhone(result.data)
    }
    void read()
    const timer = setInterval(read, POLL_MS)
    return () => clearInterval(timer)
  }, [open, phoneOpen, draftId])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const addPhotos = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return
    const files = Array.from(list)
    if (files.length > room) toast.error(t('tooManyPhotos', { max: MAX_FIX_PHOTOS }))
    setAdding(true)
    const next: Picked[] = []
    for (const original of files.slice(0, room)) {
      if (!original.type.startsWith('image/')) {
        toast.error(t('notAPhoto', { name: original.name }))
        continue
      }
      // The same compression as job photos: 1200 px, JPEG at 70%.
      const file = await compressImage(original)
      if (!(FIX_PHOTO_TYPES as readonly string[]).includes(file.type)) {
        toast.error(t('notAPhoto', { name: original.name }))
        continue
      }
      if (file.size > MAX_FIX_PHOTO_BYTES) {
        toast.error(t('photoTooBig', { name: original.name }))
        continue
      }
      const url = URL.createObjectURL(file)
      urls.current.push(url)
      next.push({ file, url })
    }
    setPicked((current) => [...current, ...next])
    setAdding(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const removePicked = (url: string) => {
    URL.revokeObjectURL(url)
    setPicked((current) => current.filter((p) => p.url !== url))
  }

  const removePhone = async (photoId: string) => {
    setPhone((current) => current.filter((p) => p.id !== photoId))
    await removeFixDraftPhoto({ draftId, photoId }).catch(() => null)
  }

  const reset = () => {
    for (const p of picked) URL.revokeObjectURL(p.url)
    setHtml('')
    setPicked([])
    setPhone([])
    setPhoneOpen(false)
    setDraftId(uuid())
    setMake('')
    setModel('')
    setYear('')
  }

  const send = async () => {
    if (!markdown || tooLong || tooManyPhotos || sending) return
    setSending(true)
    const form = new FormData()
    form.append('code', code)
    form.append('text', markdown)
    form.append('lang', locale)
    if (phone.length > 0) form.append('draftId', draftId)
    if (vehicle) {
      form.append('vehicleId', vehicle.id)
    } else {
      if (make.trim()) form.append('make', make.trim())
      if (model.trim()) form.append('model', model.trim())
      if (year.trim()) form.append('year', year.trim())
    }
    for (const p of picked) form.append('photo', p.file, p.file.name)
    let reply: ShareReply | null = null
    try {
      const res = await fetch(SHARE_URL, { method: 'POST', body: form })
      reply = (await res.json().catch(() => null)) as ShareReply | null
    } catch {
      reply = null
    }
    setSending(false)
    if (reply?.success) {
      onShared(reply.data)
      reset()
      onOpenChange(false)
      toast.success(t('sent'))
      return
    }
    // What was written stays, ready to try again.
    const error = reply && !reply.success ? reply.error : undefined
    const failure = FAILURES.find((f) => f === error) as Failure | undefined
    toast.error(failure ? t(`errors.${failure}`) : t('errors.failed'))
  }

  const vehicleLine = vehicle ? fixVehicleLine(vehicle) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle', { code })}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* The vehicle: from the job, or typed, all of it optional. */}
          {vehicle ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-card-edge bg-muted/30 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isMarine ? t('vehicleMarine') : t('vehicle')}
              </span>
              <span className="text-sm font-medium">{vehicleLine}</span>
              <span className="w-full text-xs text-muted-foreground">
                {isMarine ? t('vehicleHintMarine') : t('vehicleHint')}
              </span>
            </div>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {isMarine ? t('vehicleOptionalMarine') : t('vehicleOptional')}
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
                <div className="space-y-1.5">
                  <Label htmlFor={`fix-make-${code}`} className="text-xs text-muted-foreground">
                    {t('make')}
                  </Label>
                  <Input
                    id={`fix-make-${code}`}
                    value={make}
                    maxLength={60}
                    onChange={(e) => setMake(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`fix-model-${code}`} className="text-xs text-muted-foreground">
                    {t('model')}
                  </Label>
                  <Input
                    id={`fix-model-${code}`}
                    value={model}
                    maxLength={60}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`fix-year-${code}`} className="text-xs text-muted-foreground">
                    {t('year')}
                  </Label>
                  <Input
                    id={`fix-year-${code}`}
                    value={year}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isMarine ? t('vehicleHintMarine') : t('vehicleHint')}
              </p>
            </fieldset>
          )}

          {/* What fixed it, in the same editor as job notes. */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium" id={`fix-text-label-${code}`}>
                {t('whatFixedIt')}
              </span>
              <span
                className={cn(
                  'text-xs tabular-nums text-muted-foreground',
                  tooLong && 'font-medium text-destructive'
                )}
              >
                {t('characters', { count: markdown.length, max: MAX_FIX_TEXT })}
              </span>
            </div>
            <div className="[&_.tiptap-content]:min-h-40">
              <RichTextEditor
                content={html}
                onChange={setHtml}
                ariaLabel={t('whatFixedIt')}
                placeholder={isMarine ? t('placeholderMarine') : t('placeholder')}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('writingHint')}</p>
          </div>

          {/* Photos: picked, dropped or taken with a phone. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">{t('photos')}</span>
                <p className="text-xs text-muted-foreground">
                  {isMarine
                    ? t('photosHintMarine', { max: MAX_FIX_PHOTOS })
                    : t('photosHint', { max: MAX_FIX_PHOTOS })}
                </p>
              </div>
              <Button
                type="button"
                variant={phoneOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setPhoneOpen((v) => !v)}
                aria-expanded={phoneOpen}
              >
                <Smartphone />
                {phoneOpen ? t('phone.hide') : t('phone.button')}
              </Button>
            </div>

            {phoneOpen && (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-card-edge bg-muted/30 p-4 sm:flex-row sm:items-start">
                <div className="flex size-[164px] shrink-0 items-center justify-center rounded-lg bg-white p-2 shadow-sm">
                  {link ? (
                    <QRCodeSVG value={link.url} size={148} marginSize={0} />
                  ) : linkFailed ? (
                    <X className="size-6 text-muted-foreground" aria-hidden />
                  ) : (
                    <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                  <p className="text-sm font-medium">{t('phone.title')}</p>
                  <p className="text-sm text-muted-foreground">
                    {linkFailed ? t('phone.failed') : t('phone.body')}
                  </p>
                  {link && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {t('phone.expires', { time: formatTime(link.expiresAt) })}
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
                        {copied ? t('phone.copied') : t('phone.copy')}
                      </Button>
                    </>
                  )}
                  {phone.length > 0 && (
                    <p className="text-xs font-medium text-primary" aria-live="polite">
                      {t('phone.received', { count: phone.length })}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div
              className={cn(
                'grid grid-cols-2 gap-3 rounded-lg transition-colors sm:grid-cols-4',
                dragging &&
                  'bg-primary/5 ring-2 ring-primary/40 ring-offset-4 ring-offset-background'
              )}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('Files')) return
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void addPhotos(e.dataTransfer.files)
              }}
            >
              {picked.map((p, i) => (
                <PhotoTile
                  key={p.url}
                  src={p.url}
                  removeLabel={t('removePhoto', { n: i + 1 })}
                  onRemove={() => removePicked(p.url)}
                />
              ))}
              {phone.map((p, i) => (
                <PhotoTile
                  key={p.id}
                  src={p.url}
                  fromPhone={t('phone.badge')}
                  removeLabel={t('removePhoto', { n: picked.length + i + 1 })}
                  onRemove={() => void removePhone(p.id)}
                />
              ))}
              {room > 0 && (
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => fileInput.current?.click()}
                  className={cn(
                    'flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                    photoCount === 0 && 'col-span-2 sm:col-span-4 aspect-auto py-8'
                  )}
                >
                  {adding ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="size-5" aria-hidden />
                  )}
                  <span className="font-medium text-foreground">{t('addPhotos')}</span>
                  <span>{t('dropHere')}</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                data-testid="fix-photo-input"
                onChange={(e) => void addPhotos(e.target.files)}
              />
            </div>
            {tooManyPhotos && (
              <p className="text-xs font-medium text-destructive">
                {t('tooManyPhotosRemove', { max: MAX_FIX_PHOTOS })}
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!markdown || tooLong || tooManyPhotos || sending || adding}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PhotoTile({
  src,
  fromPhone,
  removeLabel,
  onRemove,
}: {
  src: string
  fromPhone?: string
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-card-edge bg-muted">
      <img src={src} alt="" className="size-full object-cover" />
      {fromPhone && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow-sm">
          <Smartphone className="size-3" aria-hidden />
          {fromPhone}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 rounded-full bg-background/90 p-1 text-foreground shadow-sm transition-colors hover:bg-background"
        aria-label={removeLabel}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
