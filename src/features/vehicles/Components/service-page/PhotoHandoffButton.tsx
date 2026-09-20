'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Clock, Copy, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import {
  countPhotosSince,
  createPhotoHandoffLink,
} from '@/features/vehicles/Actions/photoHandoffActions'

/** Matches PHOTO_HANDOFF_TTL_SECONDS in lib/photo-handoff.ts, which is server-only. */
const CODE_LIFETIME_MS = 30 * 60 * 1000
/** How often the dialog asks whether photos have arrived. */
const POLL_MS = 3_000
/** Enough of a concern to know which one it is; the rest is on the page behind. */
const CONCERN_SHOWN = 200

/**
 * "Add from phone": a QR code that hands this work order to a phone for half
 * an hour. The desk shows it, somebody walks out to the car, scans it, and the
 * photos they take or choose land on the job (under one concern, when the
 * button sits on a concern's row). The phone needs no sign-in; the code is a
 * signed link that can only add photos to this one job. See
 * lib/photo-handoff.ts and the public route behind it.
 *
 * While the dialog is open it counts what has arrived and refreshes the page
 * as photos come in, so the desk sees them land without reloading.
 */
export function PhotoHandoffButton({
  serviceRecordId,
  concernId = null,
  concernLabel,
  variant = 'button',
  disabled = false,
  disabledReason,
}: {
  serviceRecordId: string
  concernId?: string | null
  /** The concern in the customer's words, so both screens say which one the photos go under. */
  concernLabel?: string
  /** A small button in a card header, or a quiet text link in a row. */
  variant?: 'button' | 'link'
  disabled?: boolean
  disabledReason?: string
}) {
  const t = useTranslations('service.photoHandoff')
  const router = useRouter()
  const { formatTime } = useFormatDate()
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState<{ url: string; expiresAt: Date; since: string } | null>(null)
  const [error, setError] = useState(false)
  const [received, setReceived] = useState(0)
  const [copied, setCopied] = useState(false)
  const receivedRef = useRef(0)

  // A fresh code every time the dialog opens: the last one may have lapsed.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLink(null)
    setError(false)
    setReceived(0)
    receivedRef.current = 0
    createPhotoHandoffLink({ serviceRecordId, concernId })
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setError(true)
          return
        }
        const expiresAt = new Date(result.data.expiresAt)
        setLink({
          url: `${window.location.origin}/p/${result.data.token}`,
          expiresAt,
          // Counted from the server's own clock (the code's issue time), so a
          // desk computer whose clock is off cannot hide a photo.
          since: new Date(expiresAt.getTime() - CODE_LIFETIME_MS).toISOString(),
        })
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, serviceRecordId, concernId])

  // Photos arriving while the code is up are shown as they land.
  useEffect(() => {
    if (!open || !link) return
    const timer = setInterval(async () => {
      const result = await countPhotosSince({ serviceRecordId, since: link.since }).catch(
        () => null
      )
      if (!result?.success || typeof result.data !== 'number') return
      if (result.data > receivedRef.current) {
        receivedRef.current = result.data
        setReceived(result.data)
        router.refresh()
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [open, link, serviceRecordId, router])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const trigger =
    variant === 'link' ? (
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen(true)}
        data-testid="photo-handoff-open"
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:text-muted-foreground"
      >
        <Smartphone className="h-3 w-3" aria-hidden="true" />
        {t('button')}
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid="photo-handoff-open"
        className="h-7 gap-1.5 text-xs"
      >
        <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
        {t('button')}
      </Button>
    )

  // The concern in the customer's words, but never a wall of text in a dialog.
  const concern =
    concernId && concernLabel?.trim()
      ? concernLabel.trim().length > CONCERN_SHOWN
        ? `${concernLabel
            .trim()
            .slice(0, CONCERN_SHOWN - 1)
            .trimEnd()}…`
        : concernLabel.trim()
      : null

  const steps = [t('step1'), t('step2'), t('step3')]

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
          data-testid="photo-handoff-dialog"
        >
          <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
            {/* What this is and how it is used. */}
            <div className="flex flex-col gap-5 p-6">
              <DialogHeader className="space-y-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1.5">
                  <DialogTitle className="text-lg">{t('dialogTitle')}</DialogTitle>
                  <DialogDescription>{t('dialogBody')}</DialogDescription>
                </div>
              </DialogHeader>

              {concern && (
                <figure
                  data-testid="photo-handoff-concern"
                  className="rounded-lg border-l-4 border-primary bg-muted/50 px-4 py-3"
                >
                  <figcaption className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t('concernHeading')}
                  </figcaption>
                  <blockquote className="mt-1 whitespace-pre-line break-words text-sm">
                    {concern}
                  </blockquote>
                </figure>
              )}

              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold">{t('howTitle')}</h3>
                <ol className="space-y-2">
                  {steps.map((step, i) => (
                    <li key={step} className="flex items-start gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-auto flex gap-3 rounded-lg border border-card-edge bg-card p-3">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t('noSignIn')}</p>
                  <p>{t('customerToo')}</p>
                  <p>{t('scope')}</p>
                </div>
              </div>
            </div>

            {/* The code itself, and what has come in through it. */}
            <div className="flex flex-col items-center gap-4 border-t border-card-edge bg-muted/40 p-6 md:border-t-0 md:border-l">
              {error ? (
                <p className="my-auto text-center text-sm text-destructive">{t('failed')}</p>
              ) : !link ? (
                <div className="flex h-[232px] w-[232px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* White behind the code in either theme: a phone camera
                      reads dark on light. */}
                  <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.25)] ring-1 ring-black/5">
                    <QRCodeSVG value={link.url} size={200} marginSize={0} />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{t('scanHint')}</p>

                  <div className="flex w-full items-center gap-1">
                    <input
                      readOnly
                      value={link.url}
                      aria-label={t('copyLink')}
                      data-testid="photo-handoff-link"
                      onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[11px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={copied ? t('linkCopied') : t('copyLink')}
                      title={copied ? t('linkCopied') : t('copyLink')}
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(link.url)
                          .then(() => setCopied(true))
                          .catch(() => undefined)
                      }}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  <p
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    suppressHydrationWarning
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('expires', { time: formatTime(link.expiresAt) })}
                  </p>

                  <p
                    data-testid="photo-handoff-received"
                    className={cn(
                      'flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm',
                      received > 0
                        ? 'bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-400'
                        : 'bg-background text-muted-foreground'
                    )}
                  >
                    {received > 0 ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {received > 0 ? t('received', { count: received }) : t('waiting')}
                  </p>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-card-edge px-6 py-3">
            <Button type="button" onClick={() => setOpen(false)}>
              {t('done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
