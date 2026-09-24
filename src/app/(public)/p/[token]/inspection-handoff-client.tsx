'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  ImagePlus,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { CONDITION_TOKENS, type Condition } from '@/features/inspections/Lib/conditions'
import { cn } from '@/lib/utils'

type Problem = 'expired' | 'invalid'

export interface HandoffItem {
  id: string
  name: string
  code: string | null
  section: string
  condition: string
  defect: boolean
  photoRequired: boolean
  photoCount: number
}

interface Upload {
  key: string
  file: File
  preview: string | null
  /** The check the photo is for; null files it on the inspection as a whole. */
  itemId: string | null
  status: 'queued' | 'uploading' | 'added' | 'failed'
  error?: string
}

const ERROR_KEYS: Record<string, string> = {
  expired: 'errors.expired',
  codeLimit: 'errors.codeLimit',
  type: 'errors.type',
  tooLarge: 'errors.tooLarge',
}

/** Past this many checks the list gets a search box; a short checklist needs none. */
const SEARCH_FROM = 10

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Adding photos to an inspection from a phone that scanned the desk's code.
 *
 * Two places a photo can go. The inspection as a whole takes overview photos
 * and documents (the regulator's own form, once it is signed). A check takes
 * the photo that is its evidence, and those are what the customer looks at
 * beside each grade, so the checks graded as defects are listed first with
 * the ones that still need a photo marked. The rest of the checklist follows
 * section by section, folded, with a search box when it is long.
 *
 * Each file is sent the moment it is picked, one at a time, and each tile
 * says whether it made it, as on the work order's phone page.
 */
export function InspectionHandoffClient({
  token,
  brand,
  inspection,
  focusItemId = null,
  problem: initialProblem,
}: {
  token: string
  brand: { name: string; logoUrl: string | null } | null
  inspection?: {
    completed: boolean
    name: string
    plate: string | null
    vehicle: string | null
    items: HandoffItem[]
  }
  problem?: Problem
  /** The check the code was shown for; it is pinned at the top. */
  focusItemId?: string | null
}) {
  const t = useTranslations('service.photoHandoff')
  const tp = useTranslations('inspections.phone')
  const tg = useTranslations('inspections.grades.short')
  const [problem, setProblem] = useState<Problem | null>(initialProblem ?? null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries((inspection?.items ?? []).map((item) => [item.id, item.photoCount]))
  )
  const [query, setQuery] = useState('')
  const [logoFailed, setLogoFailed] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const documentRef = useRef<HTMLInputElement>(null)
  // The check the camera or library was opened for. A ref, because the file
  // input's change event arrives after the picker closes and must still know.
  const pendingItem = useRef<string | null>(null)
  const sending = useRef(false)
  const uploadsRef = useRef<Upload[]>([])
  uploadsRef.current = uploads

  const items = inspection?.items ?? []
  const itemName = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items])
  const checksOpen = !!inspection && !inspection.completed

  const update = (key: string, patch: Partial<Upload>) =>
    setUploads((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const send = useCallback(
    async (item: Upload) => {
      update(item.key, { status: 'uploading', error: undefined })
      let file = item.file
      if (file.type.startsWith('image/')) {
        try {
          file = await compressImage(item.file)
        } catch {
          file = item.file
        }
      }
      const body = new FormData()
      body.append('file', file)
      if (item.itemId) body.append('itemId', item.itemId)
      try {
        const res = await fetch(`/api/public/inspection-handoff/${encodeURIComponent(token)}`, {
          method: 'POST',
          body,
        })
        if (res.ok) {
          update(item.key, { status: 'added' })
          const target = item.itemId
          if (target) setCounts((prev) => ({ ...prev, [target]: (prev[target] ?? 0) + 1 }))
          return
        }
        const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code
        if (code === 'expired' || code === 'invalid') setProblem(code)
        update(item.key, {
          status: 'failed',
          error:
            code === 'completed'
              ? tp('completedError')
              : code === 'limit'
                ? tp('limitError')
                : code === 'invalid'
                  ? tp('invalid')
                  : t(code && ERROR_KEYS[code] ? ERROR_KEYS[code] : 'errors.failed'),
        })
      } catch {
        update(item.key, { status: 'failed', error: t('errors.failed') })
      }
    },
    [token, t, tp]
  )

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

  useEffect(
    () => () => {
      for (const item of uploadsRef.current) if (item.preview) URL.revokeObjectURL(item.preview)
    },
    []
  )

  const add = (list: FileList | null) => {
    if (!list?.length) return
    const itemId = pendingItem.current
    const added = Array.from(list)
      // A check takes photos; a document goes on the inspection as a whole.
      .filter(
        (file) =>
          file.type.startsWith('image/') || (itemId === null && file.type === 'application/pdf')
      )
      .map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        itemId,
        status: 'queued' as const,
      }))
    setUploads((prev) => [...added.reverse(), ...prev])
    pendingItem.current = null
  }

  const pick = (input: 'camera' | 'library' | 'document', itemId: string | null) => {
    pendingItem.current = itemId
    const ref = input === 'camera' ? cameraRef : input === 'library' ? libraryRef : documentRef
    ref.current?.click()
  }

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    add(e.target.files)
    e.target.value = ''
  }

  // The check the desk scanned for, pinned above everything else.
  const focused = focusItemId ? (items.find((item) => item.id === focusItemId) ?? null) : null
  // Defects first: those are the photos the customer is waiting for.
  const defects = items.filter((item) => item.defect)
  const sections = useMemo(() => {
    const order: string[] = []
    const grouped: Record<string, HandoffItem[]> = {}
    for (const item of items) {
      if (!grouped[item.section]) {
        grouped[item.section] = []
        order.push(item.section)
      }
      grouped[item.section].push(item)
    }
    return order.map((name) => ({ name, items: grouped[name] }))
  }, [items])
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.code ?? '').toLowerCase().includes(needle) ||
          item.section.toLowerCase().includes(needle)
      )
    : null

  const addedCount = uploads.filter((item) => item.status === 'added').length
  const firstError = uploads.find((item) => item.status === 'failed')?.error

  const itemRow = (item: HandoffItem) => {
    const count = counts[item.id] ?? 0
    const needsPhoto = item.defect && item.photoRequired && count === 0
    const busy = uploads.some(
      (u) => u.itemId === item.id && (u.status === 'queued' || u.status === 'uploading')
    )
    const tone = CONDITION_TOKENS[item.condition as Condition] ?? CONDITION_TOKENS.not_inspected
    return (
      <li key={item.id} className="flex items-center gap-2" data-testid="handoff-item">
        <button
          type="button"
          onClick={() => pick('camera', item.id)}
          disabled={!checksOpen || problem !== null}
          className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left transition-colors active:bg-muted disabled:cursor-default disabled:opacity-60"
        >
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tone.bar)} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {item.code && (
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{item.code}</span>
              )}
              {item.name}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {item.condition !== 'not_inspected' && <span>{tg(item.condition as Condition)}</span>}
              {needsPhoto && (
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {tp('photoNeeded')}
                </span>
              )}
              {count > 0 && <span>{tp('photoCount', { count })}</span>}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : count > 0 ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Camera className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => pick('library', item.id)}
          disabled={!checksOpen || problem !== null}
          aria-label={tp('chooseFor', { name: item.name })}
          className="flex h-14 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border bg-background text-muted-foreground transition-colors active:bg-muted disabled:cursor-default disabled:opacity-60"
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
        </button>
      </li>
    )
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-muted/70 to-background">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pb-8 pt-8">
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
          <h1 className="text-xl font-semibold tracking-tight">{tp('pageTitle')}</h1>
          {inspection && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
              {inspection.plate && (
                <span className="rounded-md border-2 border-foreground px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-foreground">
                  {inspection.plate}
                </span>
              )}
              {inspection.vehicle && (
                <span className="font-medium text-foreground">{inspection.vehicle}</span>
              )}
              <span className="flex items-center gap-1">
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {inspection.name}
              </span>
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
                  {problem === 'expired' ? t('errors.expired') : tp('invalid')}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-5 text-sm font-semibold">{tp('wholeTitle')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{tp('wholeBody')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => pick('camera', null)}
                  className="col-span-2 flex h-14 cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors active:bg-primary/90"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  {t('takePhoto')}
                </button>
                <button
                  type="button"
                  onClick={() => pick('library', null)}
                  className="flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-background text-sm font-medium transition-colors active:bg-muted"
                >
                  <ImagePlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('choosePhotos')}
                </button>
                <button
                  type="button"
                  onClick={() => pick('document', null)}
                  className="flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-background text-sm font-medium transition-colors active:bg-muted"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('chooseDocument')}
                </button>
              </div>
            </>
          )}
        </section>

        {focused && !problem && (
          <section
            className="rounded-2xl border-2 border-primary/50 bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.25)]"
            data-testid="handoff-focus"
          >
            <h2 className="text-base font-semibold">{tp('focusTitle')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {checksOpen ? tp('checksBody') : tp('checksClosed')}
            </p>
            <ul className="mt-3 space-y-2">{itemRow(focused)}</ul>
          </section>
        )}

        {inspection && !problem && items.length > 0 && (
          <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.25)]">
            <h2 className="text-base font-semibold">{tp('checksTitle')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {checksOpen ? tp('checksBody') : tp('checksClosed')}
            </p>

            {items.length >= SEARCH_FROM && (
              <label className="relative mt-3 block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tp('search')}
                  aria-label={tp('search')}
                  className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            )}

            {matches ? (
              matches.length > 0 ? (
                <ul className="mt-3 space-y-2">{matches.map(itemRow)}</ul>
              ) : (
                <p className="mt-4 text-center text-sm text-muted-foreground">{tp('noMatch')}</p>
              )
            ) : (
              <div className="mt-3 space-y-3">
                {defects.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {tp('defectsTitle', { count: defects.length })}
                    </h3>
                    <ul className="space-y-2">{defects.map(itemRow)}</ul>
                  </div>
                )}
                {sections.map((section) => (
                  <details key={section.name} className="group rounded-xl border bg-muted/30">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 truncate">{section.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {section.items.length}
                      </span>
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <ul className="space-y-2 px-2 pb-2">{section.items.map(itemRow)}</ul>
                  </details>
                ))}
              </div>
            )}
          </section>
        )}

        {/* `capture` opens the camera directly; the others are the library,
            several photos at a time, and PDF documents. */}
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
                  <span className="absolute inset-x-0 top-0 truncate bg-background/85 px-1.5 py-0.5 text-[10px] font-medium">
                    {item.itemId ? (itemName.get(item.itemId) ?? '') : tp('wholeShort')}
                  </span>
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
