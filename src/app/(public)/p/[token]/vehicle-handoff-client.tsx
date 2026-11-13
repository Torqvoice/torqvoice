'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Check, ImagePlus, Loader2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlateChip } from '@/components/plate-chip'

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

type State = { preview: string; status: 'uploading' | 'saved' | 'failed' } | null

/**
 * The phone side of a vehicle's "Add from phone" code: take or choose one
 * photo of the car, and it becomes the photo on the vehicle's page. A second
 * photo replaces the first. Shows the workshop and the car, nothing else.
 */
export function VehicleHandoffClient({
  token,
  brand,
  vehicle,
  problem,
}: {
  token: string
  brand: { name: string; logoUrl: string | null } | null
  vehicle: { plate: string | null; name: string } | null
  problem?: 'invalid' | 'expired'
}) {
  const t = useTranslations('service.photoHandoff')
  const [logoFailed, setLogoFailed] = useState(false)
  const [state, setState] = useState<State>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(problem === 'expired')
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const url = `/api/public/vehicle-handoff/${encodeURIComponent(token)}`

  const send = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setState({ preview: URL.createObjectURL(file), status: 'uploading' })
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(url, { method: 'POST', body }).catch(() => null)
    const reply = (await res?.json().catch(() => null)) as { code?: string } | null
    if (res?.status === 410) setExpired(true)
    if (res?.ok) {
      setState((s) => (s ? { ...s, status: 'saved' } : s))
    } else {
      setState((s) => (s ? { ...s, status: 'failed' } : s))
      setError(
        reply?.code === 'type'
          ? t('vehicle.notAPhoto')
          : reply?.code === 'tooLarge'
            ? t('errors.tooLarge')
            : t('errors.failed')
      )
    }
    if (camera.current) camera.current.value = ''
    if (library.current) library.current.value = ''
  }

  const busy = state?.status === 'uploading'
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
          {stop ? (
            <div role="alert" className="flex gap-3">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div className="space-y-1">
                <h1 className="text-base font-semibold">
                  {stop === 'expired' ? t('expiredTitle') : t('invalidTitle')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {stop === 'expired' ? t('errors.expired') : t('vehicle.invalid')}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{t('vehicle.pageTitle')}</h1>
              {vehicle && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {vehicle.plate && <PlateChip plate={vehicle.plate} />}
                  {vehicle.name}
                </p>
              )}
              <p className="mt-3 text-sm text-muted-foreground">{t('vehicle.pageBody')}</p>

              {state && (
                <div className="relative mt-5 aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
                  <img src={state.preview} alt="" className="size-full object-cover" />
                  <span
                    className={cn(
                      'absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm',
                      state.status === 'saved' && 'bg-emerald-600 text-white',
                      state.status === 'uploading' && 'bg-background/90 text-foreground',
                      state.status === 'failed' && 'bg-destructive text-white'
                    )}
                    aria-live="polite"
                  >
                    {state.status === 'saved' ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : state.status === 'uploading' ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <TriangleAlert className="size-3.5" aria-hidden />
                    )}
                    {state.status === 'saved'
                      ? t('added')
                      : state.status === 'uploading'
                        ? t('uploading')
                        : t('notAdded')}
                  </span>
                </div>
              )}

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => camera.current?.click()}
                  className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-base font-medium text-primary-foreground shadow-sm transition-opacity active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-5 w-5" aria-hidden />
                  {t('takePhoto')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => library.current?.click()}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background text-base font-medium transition-colors active:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden />
                  {t('vehicle.choosePhoto')}
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
                  hidden
                  onChange={(e) => void send(e.target.files)}
                />
              </div>

              {error && (
                <p role="alert" className="mt-3 text-center text-sm text-destructive">
                  {error}
                </p>
              )}
              {state?.status === 'saved' && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {t('vehicle.saved')}
                </p>
              )}
              <p className="mt-5 text-xs text-muted-foreground">{t('privacy')}</p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
