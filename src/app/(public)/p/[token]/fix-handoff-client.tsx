'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Check, ImagePlus, Loader2, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Upload = { key: string; preview: string; status: 'uploading' | 'added' | 'failed' }

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/**
 * The phone side of a fix's "Add from phone" code: take or pick up to four
 * photos of what fixed the code, and they appear in the share dialog on the
 * computer. Shows the workshop, the code and nothing else.
 */
export function FixHandoffClient({
  token,
  brand,
  code,
  problem,
}: {
  token: string
  brand: { name: string; logoUrl: string | null } | null
  code: string | null
  problem?: 'invalid' | 'expired'
}) {
  const t = useTranslations('faultCodes.phone')
  const [logoFailed, setLogoFailed] = useState(false)
  const [count, setCount] = useState(0)
  const [max, setMax] = useState(4)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(problem === 'expired')
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const url = `/api/public/fix-handoff/${encodeURIComponent(token)}`

  // A reopened page starts from what the draft already holds.
  useEffect(() => {
    if (problem) return
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { count: number; max: number } | null) => {
        if (!body) return
        setCount(body.count)
        setMax(body.max)
      })
      .catch(() => null)
  }, [url, problem])

  const send = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    let room = max - count
    for (const file of Array.from(files)) {
      if (room <= 0) {
        setError(t('full', { max }))
        break
      }
      room--
      const key = `${Date.now()}-${Math.random()}`
      const preview = URL.createObjectURL(file)
      setUploads((u) => [...u, { key, preview, status: 'uploading' }])
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(url, { method: 'POST', body }).catch(() => null)
      const reply = (await res?.json().catch(() => null)) as {
        count?: number
        code?: string
      } | null
      const ok = !!res?.ok && typeof reply?.count === 'number'
      if (ok) setCount(reply.count as number)
      if (res?.status === 410) setExpired(true)
      setUploads((u) =>
        u.map((x) => (x.key === key ? { ...x, status: ok ? 'added' : 'failed' } : x))
      )
      if (!ok) {
        setError(
          reply?.code === 'limit'
            ? t('full', { max })
            : reply?.code === 'type'
              ? t('notAPhoto')
              : t('failed')
        )
        if (res?.status === 410 || reply?.code === 'limit') break
      }
    }
    if (camera.current) camera.current.value = ''
    if (library.current) library.current.value = ''
  }

  const busy = uploads.some((u) => u.status === 'uploading')
  const full = count >= max
  const stop = problem === 'invalid' ? 'invalid' : expired ? 'expired' : null

  return (
    <div className="min-h-dvh bg-gradient-to-b from-muted/70 to-background">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pb-8 pt-8">
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
            <p className="text-sm font-medium text-muted-foreground">{brand.name}</p>
          </header>
        )}

        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.25)]">
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          {code && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-sm font-semibold text-primary">
                {code}
              </span>
              {t('forCode')}
            </p>
          )}

          {stop ? (
            <div
              role="alert"
              className="mt-5 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
            >
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <p className="text-sm">{stop === 'expired' ? t('expired') : t('invalid')}</p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">{t('intro', { max })}</p>
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  disabled={full || busy}
                  onClick={() => camera.current?.click()}
                  className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-base font-medium text-primary-foreground shadow-sm transition-opacity active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-5 w-5" aria-hidden />
                  {t('take')}
                </button>
                <button
                  type="button"
                  disabled={full || busy}
                  onClick={() => library.current?.click()}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background text-base font-medium transition-colors active:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden />
                  {t('choose')}
                </button>
                <input
                  ref={camera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => void send(e.target.files)}
                />
                <input
                  ref={library}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => void send(e.target.files)}
                />
              </div>

              <p className="mt-4 text-center text-sm font-medium" aria-live="polite">
                {t('added', { count, max })}
              </p>
              {uploads.length > 0 && (
                <ul className="mt-3 grid grid-cols-4 gap-2">
                  {uploads.map((u) => (
                    <li
                      key={u.key}
                      className="relative aspect-square overflow-hidden rounded-lg border"
                    >
                      <img src={u.preview} alt="" className="size-full object-cover" />
                      <span
                        className={cn(
                          'absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full shadow-sm',
                          u.status === 'added' && 'bg-emerald-600 text-white',
                          u.status === 'uploading' && 'bg-background/90',
                          u.status === 'failed' && 'bg-destructive text-white'
                        )}
                      >
                        {u.status === 'added' ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : u.status === 'uploading' ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <X className="size-3.5" aria-hidden />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p role="alert" className="mt-3 text-center text-sm text-destructive">
                  {error}
                </p>
              )}
              {count > 0 && !busy && (
                <p className="mt-4 text-center text-sm text-muted-foreground">{t('done')}</p>
              )}
              <p className="mt-5 text-xs text-muted-foreground">{t('privacy')}</p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
