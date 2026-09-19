'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Camera,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { cn } from '@/lib/utils'

type Problem = 'expired' | 'invalid'

interface Upload {
  key: string
  file: File
  /** An object URL for a photo; a document has no picture to show. */
  preview: string | null
  status: 'queued' | 'uploading' | 'added' | 'failed'
  error?: string
}

/** What the upload route answers with, mapped to words on this page. */
const ERROR_KEYS: Record<string, string> = {
  expired: 'errors.expired',
  invalid: 'errors.invalid',
  limit: 'errors.limit',
  codeLimit: 'errors.codeLimit',
  type: 'errors.type',
  tooLarge: 'errors.tooLarge',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Adding photos and documents to one work order, on a phone that scanned the
 * desk's code: a mechanic's out at the car, or the customer's own. "Take
 * photo" opens the camera straight away, "Choose photos" picks several from
 * the library, and "Upload a document" takes a PDF. Each is sent the moment
 * it is picked, one at a time so a weak signal outdoors is not swamped, and
 * each tile says whether it made it, with a retry when it did not.
 *
 * It is the workshop's page as far as the person holding the phone can tell:
 * its name and logo at the top, the car underneath, and nothing of the job's
 * contents.
 */
export function PhotoHandoffClient({
  token,
  brand,
  job,
  problem: initialProblem,
}: {
  token: string
  brand: { name: string; logoUrl: string | null } | null
  job?: { number: string | null; plate: string | null; vehicle: string | null }
  problem?: Problem
}) {
  const t = useTranslations('service.photoHandoff')
  const [problem, setProblem] = useState<Problem | null>(initialProblem ?? null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [logoFailed, setLogoFailed] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const documentRef = useRef<HTMLInputElement>(null)
  const sending = useRef(false)
  const uploadsRef = useRef<Upload[]>([])
  uploadsRef.current = uploads

  const update = (key: string, patch: Partial<Upload>) =>
    setUploads((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const send = useCallback(
    async (item: Upload) => {
      update(item.key, { status: 'uploading', error: undefined })
      let file = item.file
      // A photo is shrunk here with the same settings as every other upload
      // in the app, so it travels fast on a car-park signal. The server
      // compresses again whatever arrives; one this browser cannot decode goes
      // as it is. A document goes as it is.
      if (file.type.startsWith('image/')) {
        try {
          file = await compressImage(item.file)
        } catch {
          file = item.file
        }
      }
      const body = new FormData()
      body.append('file', file)
      try {
        const res = await fetch(`/api/public/photo-handoff/${encodeURIComponent(token)}`, {
          method: 'POST',
          body,
        })
        if (res.ok) {
          update(item.key, { status: 'added' })
          return
        }
        const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code
        if (code === 'expired' || code === 'invalid') setProblem(code)
        update(item.key, {
          status: 'failed',
          error: t(code && ERROR_KEYS[code] ? ERROR_KEYS[code] : 'errors.failed'),
        })
      } catch {
        update(item.key, { status: 'failed', error: t('errors.failed') })
      }
    },
    [token, t]
  )

  // One at a time, in the order they were picked.
  const pump = useCallback(async () => {
    if (sending.current) return
    sending.current = true
    try {
      for (;;) {
        const next = uploadsRef.current.find((item) => item.status === 'queued')
        if (!next) break
        await send(next)
      }
    } finally {
      sending.current = false
    }
  }, [send])

  useEffect(() => {
    if (uploads.some((item) => item.status === 'queued')) void pump()
  }, [uploads, pump])

  // The previews are object URLs; let them go with the page.
  useEffect(
    () => () => {
      for (const item of uploadsRef.current) if (item.preview) URL.revokeObjectURL(item.preview)
    },
    []
  )

  const add = (list: FileList | null) => {
    if (!list?.length) return
    const added = Array.from(list)
      .filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf')
      .map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        status: 'queued' as const,
      }))
    setUploads((prev) => [...added.reverse(), ...prev])
  }

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    add(e.target.files)
    e.target.value = ''
  }

  const addedCount = uploads.filter((item) => item.status === 'added').length
  const firstError = uploads.find((item) => item.status === 'failed')?.error

  return (
    <div className="min-h-dvh bg-gradient-to-b from-muted/70 to-background">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pb-8 pt-8">
        {/* The workshop, as the customer knows it. */}
        {brand && (
          <header className="flex flex-col items-center gap-3 text-center">
            {brand.logoUrl && !logoFailed ? (
              <img
                src={brand.logoUrl}
                alt={brand.name}
                onError={() => setLogoFailed(true)}
                className="max-h-16 max-w-[220px] object-contain"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-sm">
                {initials(brand.name)}
              </span>
            )}
            <p
              className="text-sm font-medium text-muted-foreground"
              data-testid="photo-handoff-workshop"
            >
              {brand.name}
            </p>
          </header>
        )}

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.25)]">
          <h1 className="text-xl font-semibold tracking-tight">{t('pageTitle')}</h1>
          {job && (job.number || job.plate || job.vehicle) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
              {job.plate && (
                <span className="rounded-md border-2 border-foreground px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-foreground">
                  {job.plate}
                </span>
              )}
              {job.vehicle && <span className="font-medium text-foreground">{job.vehicle}</span>}
              {job.number && <span>{t('forJob', { number: job.number })}</span>}
            </div>
          )}

          {problem ? (
            <div
              role="alert"
              data-testid="photo-handoff-problem"
              className="mt-5 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
            >
              <TriangleAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-semibold">
                  {problem === 'expired' ? t('expiredTitle') : t('invalidTitle')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {problem === 'expired' ? t('errors.expired') : t('errors.invalid')}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="col-span-2 flex h-16 cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors active:bg-primary/90"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  {t('takePhoto')}
                </button>
                <button
                  type="button"
                  onClick={() => libraryRef.current?.click()}
                  className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-background text-sm font-medium transition-colors active:bg-muted"
                >
                  <ImagePlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('choosePhotos')}
                </button>
                <button
                  type="button"
                  onClick={() => documentRef.current?.click()}
                  className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-background text-sm font-medium transition-colors active:bg-muted"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('chooseDocument')}
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">{t('hint')}</p>

              {/* `capture` opens the camera directly; the others are the
                  library, several photos at a time, and PDF documents. */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                data-testid="photo-handoff-camera"
                onChange={onPicked}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                data-testid="photo-handoff-library"
                onChange={onPicked}
              />
              <input
                ref={documentRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                data-testid="photo-handoff-document"
                onChange={onPicked}
              />
            </>
          )}
        </section>

        {uploads.length > 0 && (
          <section className="space-y-3">
            {addedCount > 0 && (
              <p
                data-testid="photo-handoff-added"
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-700"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t('addedCount', { count: addedCount })}
              </p>
            )}
            <ul className="grid grid-cols-3 gap-2">
              {uploads.map((item) => (
                <li
                  key={item.key}
                  data-testid="photo-handoff-shot"
                  data-status={item.status}
                  className="relative aspect-square overflow-hidden rounded-xl border bg-card shadow-sm"
                >
                  {item.preview ? (
                    <img src={item.preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-2 pb-6 text-center">
                      <FileText className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      <span className="line-clamp-2 break-all text-[11px] text-muted-foreground">
                        {item.file.name}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      'absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 px-1 py-1 text-[11px] font-medium',
                      item.status === 'added' && 'bg-emerald-600/90 text-white',
                      item.status === 'failed' && 'bg-destructive/90 text-white',
                      (item.status === 'uploading' || item.status === 'queued') &&
                        'bg-background/85 text-foreground'
                    )}
                  >
                    {item.status === 'added' && (
                      <>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        {t('added')}
                      </>
                    )}
                    {(item.status === 'uploading' || item.status === 'queued') && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        {t('uploading')}
                      </>
                    )}
                    {item.status === 'failed' && (
                      <button
                        type="button"
                        disabled={problem !== null}
                        onClick={() => update(item.key, { status: 'queued' })}
                        title={item.error}
                        className="flex cursor-pointer items-center gap-1 disabled:cursor-default disabled:opacity-70"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        {problem ? t('notAdded') : t('retry')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {firstError && !problem && (
              <p className="text-center text-sm text-destructive">{firstError}</p>
            )}
          </section>
        )}

        <p className="mt-auto flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('privacy')}
        </p>
      </main>
    </div>
  )
}
