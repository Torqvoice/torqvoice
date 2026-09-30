'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eraser, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  addConditionMark,
  addConditionMarkPhotos,
  removeConditionMark,
  removeConditionMarkPhoto,
  resolveConditionMark,
  setVehicleBodyType,
  updateConditionMark,
} from '../Actions/conditionMarkActions'
import { BODY_TYPES, type BodyType, type View, VIEWS } from '../Lib/drawingTypes'
import {
  type ConditionMarkData,
  type MarkScope,
  type MarkSeverity,
  bodyTypeFor,
  isDrawnOnSheet,
  isOwnMark,
  numberedMarks,
  splitMarks,
} from '../Lib/marks'
import { ConditionMap, type MapMark, type MapTap, MarkIcon } from './ConditionMap'
import { ImageCarousel } from '@/features/vehicles/Components/service-detail/ImageCarousel'
import type { Attachment } from '@/features/vehicles/Components/service-detail/types'
import { type MarkType, markTypeOf } from '../Lib/markTypes'
import { MarkEditor } from './MarkEditor'

/** Photos saved on a mark per call, the action's own limit. */
const PHOTOS_PER_SAVE = 10
/**
 * The condition map with everything around it: the body type, the view
 * switcher, the drawing, the legend of this sheet's marks, and the marks
 * still open from earlier visits waiting to be confirmed or cleared.
 *
 * Marks belong to the vehicle. This sheet's own are drawn in colour and
 * listed as new since the last visit; earlier ones are grey. A tap on the
 * drawing creates a mark at once (a dent, minor) and opens it to be
 * described, so a walk-round is tap, describe, next.
 */
export function ConditionMapCard({
  vehicle,
  scope,
  types,
  initialMarks,
  readOnly = false,
  serviceType = 'automotive',
  compact = false,
  onCountChange,
}: {
  vehicle: { id: string; bodyType: string | null }
  scope: MarkScope
  /** The workshop's kinds of mark, in the reader's language. */
  types: readonly MarkType[]
  initialMarks: ConditionMarkData[]
  readOnly?: boolean
  serviceType?: 'automotive' | 'marine' | string
  /** Without the card's heading, for a host that has its own. */
  compact?: boolean
  /** How many marks this sheet holds, for a host that counts them. */
  onCountChange?: (own: number, previous: number) => void
}) {
  const t = useTranslations('conditionMap')
  const router = useRouter()
  const [marks, setMarks] = useState<ConditionMarkData[]>(initialMarks)
  const [body, setBody] = useState<BodyType>(bodyTypeFor(vehicle, { serviceType }))
  const [focusView, setFocusView] = useState<View | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [clearingId, setClearingId] = useState<string | null>(null)
  /** Which of the strip's photos is open full size, if any. */
  const [viewing, setViewing] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const { own, previous } = useMemo(() => splitMarks(marks, scope), [marks, scope])
  const numbered = useMemo(() => numberedMarks([...previous, ...own]), [previous, own])
  const numberOf = useMemo(() => new Map(numbered.map((m, i) => [m.id, i + 1])), [numbered])
  const ownIds = useMemo(() => new Set(own.map((m) => m.id)), [own])
  // This visit's marks that another sheet holds: the job's linked inspection.
  // They are drawn in colour with the job's own and changed on the inspection.
  const elsewhereSheet = useMemo(
    () => new Set(own.filter((m) => !isDrawnOnSheet(m, scope)).map((m) => m.id)),
    [own, scope]
  )

  const mapMarks: MapMark[] = numbered
    .filter((m) => m.bodyType === body)
    .map((m) => ({
      id: m.id,
      view: m.view,
      x: m.x,
      y: m.y,
      kind: m.kind,
      severity: m.severity,
      number: numberOf.get(m.id) ?? 0,
      previous: !ownIds.has(m.id),
      fixed: elsewhereSheet.has(m.id),
    }))
  // Marks drawn on another body type cannot be placed on this drawing; they
  // still count and are still listed.
  const elsewhere = numbered.filter((m) => m.bodyType !== body).length

  // The host hears the count after a change has been applied, never from
  // inside a state updater: React runs those during render, and setting the
  // host's state there is a setState-in-render error.
  useEffect(() => {
    onCountChange?.(own.length, previous.length)
    // The host's callback is the same function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own.length, previous.length])

  const replace = (updated: ConditionMarkData) => {
    setMarks((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  const handleTap = (tap: MapTap) => {
    if (readOnly) return
    startTransition(async () => {
      const result = await addConditionMark({
        vehicleId: vehicle.id,
        // The sheet the mark is drawn on; a linked inspection only lends its marks.
        ...('inspectionItemId' in scope
          ? { inspectionId: scope.inspectionId, inspectionItemId: scope.inspectionItemId }
          : { serviceRecordId: scope.serviceRecordId }),
        bodyType: body,
        view: tap.view,
        panel: tap.panel,
        x: tap.x,
        y: tap.y,
        // The first kind the workshop offers; the editor opens to change it.
        kind: types.find((type) => !type.hidden)?.key ?? 'dent',
        severity: 'minor',
      })
      if (!result.success || !result.data) {
        toast.error(result.success ? t('saveFailed') : result.error || t('saveFailed'))
        return
      }
      const created = result.data
      setMarks((prev) => [...prev, created])
      setEditingId(created.id)
    })
  }

  const handleMove = (id: string, to: MapTap) => {
    const before = marks.find((m) => m.id === id)
    if (!before) return
    replace({ ...before, view: to.view, panel: to.panel, x: to.x, y: to.y })
    startTransition(async () => {
      const result = await updateConditionMark(id, {
        view: to.view,
        panel: to.panel,
        x: to.x,
        y: to.y,
      })
      if (!result.success) {
        replace(before)
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  const handleChange = (patch: {
    kind?: string
    severity?: MarkSeverity
    note?: string | null
  }) => {
    if (!editingId) return
    const before = marks.find((m) => m.id === editingId)
    if (!before) return
    replace({ ...before, ...patch, note: patch.note === undefined ? before.note : patch.note })
    startTransition(async () => {
      const result = await updateConditionMark(editingId, patch)
      if (!result.success) {
        replace(before)
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  const handleRemove = () => {
    const id = editingId
    if (!id) return
    setEditingId(null)
    const before = marks
    setMarks((prev) => prev.filter((m) => m.id !== id))
    startTransition(async () => {
      const result = await removeConditionMark(id)
      if (!result.success) {
        setMarks(before)
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  const handleAddPhotos = async (files: File[]) => {
    if (!editingId) return
    const urls: string[] = []
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch('/api/protected/upload/service-files', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (data.url) urls.push(data.url)
        else toast.error(data.error || t('uploadFailed'))
      } catch {
        toast.error(t('uploadFailed'))
      }
    }
    if (urls.length === 0) return
    // The action takes a handful at a time; a whole camera roll goes in batches.
    const before = marks.find((m) => m.id === editingId)
    for (let start = 0; start < urls.length; start += PHOTOS_PER_SAVE) {
      const batch = urls.slice(start, start + PHOTOS_PER_SAVE)
      const result = await addConditionMarkPhotos({ id: editingId, urls: batch })
      if (!result.success || !result.data) {
        toast.error(result.success ? t('uploadFailed') : result.error || t('uploadFailed'))
        break
      }
      if (before) replace({ ...before, imageUrls: result.data })
    }
    router.refresh()
  }

  const handleRemovePhoto = (url: string) => {
    if (!editingId) return
    const before = marks.find((m) => m.id === editingId)
    if (!before) return
    replace({ ...before, imageUrls: before.imageUrls.filter((u) => u !== url) })
    startTransition(async () => {
      const result = await removeConditionMarkPhoto({ id: editingId, url })
      if (!result.success) {
        replace(before)
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  const handleClear = () => {
    const id = clearingId
    if (!id) return
    setClearingId(null)
    const before = marks.find((m) => m.id === id)
    if (!before) return
    replace({ ...before, resolvedAt: new Date().toISOString() })
    startTransition(async () => {
      const result = await resolveConditionMark(id, true)
      if (!result.success) {
        replace(before)
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  const handleBody = (next: string) => {
    if (!BODY_TYPES.includes(next as BodyType)) return
    setBody(next as BodyType)
    setFocusView(null)
    startTransition(async () => {
      const result = await setVehicleBodyType(vehicle.id, next)
      if (!result.success) toast.error(result.error || t('saveFailed'))
    })
  }

  // The photos of every mark shown, in legend order, each with its mark's
  // words, so a walk-round's pictures are read in one place: the desk sees
  // what the technician saw without opening ten dents.
  const photos = numbered.flatMap((mark) =>
    mark.imageUrls.map((url) => {
      const number = numberOf.get(mark.id) ?? 0
      const caption = `${number}. ${t('markOn', {
        kind: markTypeOf(types, mark.kind).name,
        area: t(`panels.${mark.panel}`),
      })}${ownIds.has(mark.id) ? '' : ` (${t('previousShort')})`}`
      return { mark, url, number, caption }
    })
  )
  // The same strip as the viewer shows it: full size, one after another,
  // each captioned with its mark.
  const viewerImages: Attachment[] = photos.map(({ mark, url, caption }, index) => ({
    id: `${mark.id}-${index}`,
    fileName: caption,
    fileUrl: url,
    fileType: 'image/*',
    fileSize: 0,
    category: 'image',
    description: caption,
    createdAt: new Date(mark.recordedAt),
  }))

  const editing = editingId ? (marks.find((m) => m.id === editingId) ?? null) : null
  const clearing = clearingId ? (marks.find((m) => m.id === clearingId) ?? null) : null

  return (
    <div className="space-y-3" data-testid="condition-map">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {!compact && <h3 className="text-sm font-semibold">{t('title')}</h3>}
          <p className="text-xs text-muted-foreground">
            {readOnly ? t('readOnly') : t('addHint')}
            {pending && (
              <Loader2 className="ml-1 inline h-3 w-3 animate-spin" aria-label={t('saved')} />
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={body} onValueChange={handleBody} disabled={readOnly}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label={t('bodyType')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BODY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`bodies.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* One view at a time for a finger; the whole sheet for a desk. */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('allViews')}>
        <ViewTab active={focusView === null} onClick={() => setFocusView(null)}>
          {t('allViews')}
        </ViewTab>
        {VIEWS.map((view) => (
          <ViewTab key={view} active={focusView === view} onClick={() => setFocusView(view)}>
            {t(`views.${view}`)}
          </ViewTab>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="rounded-lg border bg-card p-2">
          <ConditionMap
            body={body}
            marks={mapMarks}
            types={types}
            selectedId={editingId}
            focusView={focusView}
            readOnly={readOnly}
            onTap={handleTap}
            onSelect={(id) => setEditingId(id)}
            onMove={handleMove}
          />
        </div>

        <div className="space-y-3">
          <section aria-label={t('legend')}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {own.length > 0 ? t('newSinceLastVisit') : t('legend')} ·{' '}
              {t('count', { count: own.length })}
            </p>
            {own.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                {t('noMarks')}
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {numbered
                  .filter((m) => ownIds.has(m.id))
                  .map((mark) => (
                    <LegendRow
                      key={mark.id}
                      mark={mark}
                      types={types}
                      number={numberOf.get(mark.id) ?? 0}
                      previous={false}
                      fromInspection={elsewhereSheet.has(mark.id)}
                      onOpen={() => setEditingId(mark.id)}
                    />
                  ))}
              </ul>
            )}
          </section>

          {previous.length > 0 && (
            <section aria-label={t('previousHeading')}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t('previousHeading')} · {t('previousCount', { count: previous.length })}
              </p>
              <p className="mb-1 text-xs text-muted-foreground">{t('previousHint')}</p>
              <ul className="divide-y rounded-md border">
                {numbered
                  .filter((m) => !ownIds.has(m.id))
                  .map((mark) => (
                    <LegendRow
                      key={mark.id}
                      mark={mark}
                      types={types}
                      number={numberOf.get(mark.id) ?? 0}
                      previous
                      onOpen={() => setEditingId(mark.id)}
                      onClear={readOnly ? undefined : () => setClearingId(mark.id)}
                    />
                  ))}
              </ul>
            </section>
          )}
          {elsewhere > 0 && (
            <p className="text-xs text-muted-foreground">{t('elsewhere', { count: elsewhere })}</p>
          )}
        </div>
      </div>

      {/* Every mark's photos in one strip, each saying which mark it belongs
          to, so nobody opens ten dents to find the one picture they want.
          A photo opens its mark. */}
      {photos.length > 0 && (
        <section aria-label={t('photosHeading')} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t('photosHeading')} · {t('photoCount', { count: photos.length })}
          </p>
          <div className="flex flex-wrap gap-2" data-testid="condition-map-photos">
            {photos.map(({ mark, url, number, caption }, index) => (
              <div key={url} className="w-24">
                <button
                  type="button"
                  onClick={() => setViewing(index)}
                  className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${t('photosOf', { n: number })}: ${caption}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-24 w-24 rounded-md border object-cover" />
                </button>
                {/* The caption opens the mark itself, for the note or a change. */}
                <button
                  type="button"
                  onClick={() => setEditingId(mark.id)}
                  className={cn(
                    'mt-1 block w-full truncate text-left text-[11px] leading-tight hover:underline',
                    !ownIds.has(mark.id) && 'text-muted-foreground'
                  )}
                  title={caption}
                >
                  {caption}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <ImageCarousel
        images={viewerImages}
        currentIndex={viewing}
        onClose={() => setViewing(null)}
        onChangeIndex={setViewing}
      />

      <MarkEditor
        types={types}
        mark={
          editing
            ? {
                id: editing.id,
                number: numberOf.get(editing.id) ?? 0,
                panel: editing.panel,
                kind: editing.kind,
                severity: editing.severity,
                note: editing.note,
                imageUrls: editing.imageUrls,
              }
            : null
        }
        open={editing !== null}
        readOnly={readOnly || (editing ? !isDrawnOnSheet(editing, scope) : false)}
        readOnlyReason={
          readOnly || !editing || isDrawnOnSheet(editing, scope)
            ? undefined
            : isOwnMark(editing, scope)
              ? t('readOnlyLinked')
              : t('readOnlyEarlier')
        }
        busy={pending}
        onChange={handleChange}
        onRemove={handleRemove}
        onAddPhotos={handleAddPhotos}
        onRemovePhoto={handleRemovePhoto}
        onClose={() => setEditingId(null)}
      />

      <AlertDialog open={clearing !== null} onOpenChange={(open) => !open && setClearingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clearRepaired')}</AlertDialogTitle>
            <AlertDialogDescription>
              {clearing &&
                t('clearBody', {
                  n: numberOf.get(clearing.id) ?? 0,
                  area: t(`panels.${clearing.panel}`),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear}>{t('clearRepaired')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'h-8 rounded-md border px-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-input bg-background text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function LegendRow({
  mark,
  types,
  number,
  previous,
  fromInspection = false,
  onOpen,
  onClear,
}: {
  mark: ConditionMarkData
  types: readonly MarkType[]
  number: number
  previous: boolean
  /** Recorded on the inspection linked to this job, and changed there. */
  fromInspection?: boolean
  onOpen: () => void
  onClear?: () => void
}) {
  const t = useTranslations('conditionMap')
  return (
    <li className="flex items-start gap-2 px-2 py-1.5 text-sm">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2 rounded text-left hover:bg-muted/60"
        aria-label={t('markLabel', {
          n: number,
          kind: markTypeOf(types, mark.kind).name,
          area: t(`panels.${mark.panel}`),
        })}
      >
        <MarkIcon
          type={markTypeOf(types, mark.kind)}
          severity={mark.severity as MarkSeverity}
          number={number}
          previous={previous}
          size={24}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', previous && 'text-muted-foreground')}>
            {t('markOn', {
              kind: markTypeOf(types, mark.kind).name,
              area: t(`panels.${mark.panel}`),
            })}
            {mark.severity === 'major' && (
              <span className="ml-1.5 rounded-full bg-red-600/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:text-red-300">
                {t('severities.major')}
              </span>
            )}
          </span>
          {mark.note && (
            <span className="block truncate text-xs text-muted-foreground">{mark.note}</span>
          )}
          {fromInspection && (
            <span className="block text-[11px] text-muted-foreground">{t('fromInspection')}</span>
          )}
          {mark.imageUrls.length > 0 && (
            <span className="block text-[11px] text-muted-foreground">
              {t('photoCount', { count: mark.imageUrls.length })}
            </span>
          )}
        </span>
      </button>
      {onClear && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={onClear}
        >
          <Eraser className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t('clearRepaired')}
        </Button>
      )}
    </li>
  )
}
