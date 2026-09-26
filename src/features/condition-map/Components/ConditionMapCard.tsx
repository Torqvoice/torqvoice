'use client'

import { useMemo, useState, useTransition } from 'react'
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
  type MarkKind,
  type MarkScope,
  type MarkSeverity,
  bodyTypeFor,
  numberedMarks,
  splitMarks,
} from '../Lib/marks'
import { ConditionMap, type MapMark, type MapTap, MarkIcon } from './ConditionMap'
import { MarkEditor } from './MarkEditor'

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
  initialMarks,
  readOnly = false,
  serviceType = 'automotive',
  compact = false,
  onCountChange,
}: {
  vehicle: { id: string; bodyType: string | null }
  scope: MarkScope
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
  const [pending, startTransition] = useTransition()

  const { own, previous } = useMemo(() => splitMarks(marks, scope), [marks, scope])
  const numbered = useMemo(() => numberedMarks([...previous, ...own]), [previous, own])
  const numberOf = useMemo(() => new Map(numbered.map((m, i) => [m.id, i + 1])), [numbered])
  const ownIds = useMemo(() => new Set(own.map((m) => m.id)), [own])

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
    }))
  // Marks drawn on another body type cannot be placed on this drawing; they
  // still count and are still listed.
  const elsewhere = numbered.filter((m) => m.bodyType !== body).length

  const report = (next: ConditionMarkData[]) => {
    const split = splitMarks(next, scope)
    onCountChange?.(split.own.length, split.previous.length)
  }

  const replace = (updated: ConditionMarkData) => {
    setMarks((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? updated : m))
      report(next)
      return next
    })
  }

  const handleTap = (tap: MapTap) => {
    if (readOnly) return
    startTransition(async () => {
      const result = await addConditionMark({
        vehicleId: vehicle.id,
        ...scope,
        bodyType: body,
        view: tap.view,
        panel: tap.panel,
        x: tap.x,
        y: tap.y,
        kind: 'dent',
        severity: 'minor',
      })
      if (!result.success || !result.data) {
        toast.error(result.success ? t('saveFailed') : result.error || t('saveFailed'))
        return
      }
      const created = result.data
      setMarks((prev) => {
        const next = [...prev, created]
        report(next)
        return next
      })
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
    kind?: MarkKind
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
    setMarks((prev) => {
      const next = prev.filter((m) => m.id !== id)
      report(next)
      return next
    })
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
    const result = await addConditionMarkPhotos({ id: editingId, urls })
    if (result.success && result.data) {
      const before = marks.find((m) => m.id === editingId)
      if (before) replace({ ...before, imageUrls: result.data })
      router.refresh()
    } else {
      toast.error(result.success ? t('uploadFailed') : result.error || t('uploadFailed'))
    }
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
                      number={numberOf.get(mark.id) ?? 0}
                      previous={false}
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

      <MarkEditor
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
        readOnly={readOnly || (editing ? !ownIds.has(editing.id) : false)}
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
  number,
  previous,
  onOpen,
  onClear,
}: {
  mark: ConditionMarkData
  number: number
  previous: boolean
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
          kind: t(`kinds.${mark.kind}`),
          area: t(`panels.${mark.panel}`),
        })}
      >
        <MarkIcon
          kind={mark.kind as MarkKind}
          severity={mark.severity as MarkSeverity}
          number={number}
          previous={previous}
          size={24}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', previous && 'text-muted-foreground')}>
            {t('markOn', { kind: t(`kinds.${mark.kind}`), area: t(`panels.${mark.panel}`) })}
            {mark.severity === 'major' && (
              <span className="ml-1.5 rounded-full bg-red-600/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:text-red-300">
                {t('severities.major')}
              </span>
            )}
          </span>
          {mark.note && (
            <span className="block truncate text-xs text-muted-foreground">{mark.note}</span>
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
