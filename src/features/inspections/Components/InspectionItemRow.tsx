'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Camera,
  Check,
  Loader2,
  Minus,
  OctagonAlert,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateInspectionItem } from '../Actions/inspectionActions'
import { DefectSuggestions } from './DefectSuggestions'
import type { DefectSuggestion } from '../Lib/defectCatalogue'
import {
  CONDITION_TOKENS,
  SCALE_STEPS,
  conditionGrade,
  formatRange,
  gradeMeasurement,
  isDefect,
  type Condition,
  type SeverityScale,
} from '../Lib/conditions'
import { useConditionLabels } from '../Lib/useConditionLabels'

export interface InspectionItemData {
  id: string
  name: string
  section: string
  sortOrder: number
  condition: string
  notes: string | null
  imageUrls: string[]
  description?: string | null
  code?: string | null
  sectionCode?: string | null
  inputType?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  choices?: string[]
  required?: boolean
  photoRequired?: boolean
  defaultSeverity?: string | null
  defectSuggestions?: string[] | null
  measuredValue?: number | null
  textValue?: string | null
}

const CONDITION_ICONS: Record<Condition, React.ComponentType<{ className?: string }>> = {
  pass: Check,
  attention: TriangleAlert,
  fail: XCircle,
  dangerous: OctagonAlert,
  not_inspected: Minus,
}

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url)

/** An empty or unparseable field means "no reading", never NaN. */
function parseReading(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * Grading control.
 *
 * A real radiogroup: arrow keys move between the grades, a roving tabindex
 * keeps the group to one tab stop, and every option carries its own icon and
 * visible text so the grade never depends on colour alone (WCAG 2.1 SC 1.4.1).
 * Targets are 44px tall, which the previous 32px icon-only circles were not.
 */
function GradeControl({
  value,
  scale,
  country,
  labelledBy,
  disabled,
  onChange,
}: {
  value: Condition
  scale: SeverityScale
  /** Drives the national defect code shown on each grade, if any. */
  country: string | null
  labelledBy: string
  disabled?: boolean
  onChange: (next: Condition, options?: { focusNotes?: boolean }) => void
}) {
  const { graded, hint, short } = useConditionLabels(scale, country)
  const steps: Condition[] = [...SCALE_STEPS[scale], 'not_inspected']
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const focusStep = (index: number) => {
    const next = (index + steps.length) % steps.length
    refs.current[next]?.focus()
    // Keyboard navigation keeps focus on the group; only a click hands focus
    // on to the notes field, otherwise arrowing past a defect grade would
    // throw the user out of the control mid-navigation.
    onChange(steps[next], { focusNotes: false })
  }

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusStep(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusStep(index - 1)
    }
  }

  // Roving tabindex: the checked option owns the tab stop, or the first one
  // when nothing has been graded yet.
  const activeIndex = Math.max(steps.indexOf(value), 0)

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-1">
      {steps.map((step, index) => {
        const token = CONDITION_TOKENS[step]
        const Icon = CONDITION_ICONS[step]
        const checked = value === step
        const grade = conditionGrade(step, scale, country)
        const text = short(step)
        return (
          <button
            key={step}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${graded(step)}. ${hint(step)}`}
            tabIndex={index === activeIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(step)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`focus-visible:ring-ring inline-flex h-11 min-w-[4.25rem] items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 ${
              checked
                ? token.solid
                : 'bg-background text-muted-foreground hover:bg-muted border-input'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {grade !== null && <span className="font-semibold tabular-nums">{grade}</span>}
            {text}
          </button>
        )
      })}
    </div>
  )
}

export function InspectionItemRow({
  item,
  scale,
  country = null,
  isCompleted,
  history,
  onOpenImage,
  onChanged,
  onSaveState,
}: {
  item: InspectionItemData
  scale: SeverityScale
  country?: string | null
  isCompleted: boolean
  /** Wording this workshop has used before on a check of this name. */
  history?: { text: string; severity: string }[]
  /** Opens the shared lightbox on the given URL. */
  onOpenImage: (url: string) => void
  /** Lets the page recompute the summary without a server round-trip. */
  onChanged: (itemId: string, change: { condition: Condition; photoCount: number }) => void
  /** Reports the autosave lifecycle so the page can show whether work is safe. */
  onSaveState?: (itemId: string, state: 'saving' | 'saved' | 'error') => void
}) {
  const t = useTranslations('inspections.item')
  const fieldId = useId()
  const nameId = `${fieldId}-name`

  const [condition, setCondition] = useState(item.condition as Condition)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [measured, setMeasured] = useState(
    item.measuredValue === null || item.measuredValue === undefined
      ? ''
      : String(item.measuredValue)
  )
  const [textValue, setTextValue] = useState(item.textValue ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(item.imageUrls ?? [])
  const [showNotes, setShowNotes] = useState(!!item.notes)
  const [notesRequired, setNotesRequired] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [isUploading, setIsUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const inputType = item.inputType ?? 'condition'
  const range = formatRange(item)
  const token = CONDITION_TOKENS[condition] ?? CONDITION_TOKENS.not_inspected
  const needsPhoto = !!item.photoRequired && isDefect(condition) && imageUrls.length === 0

  const save = (patch: {
    condition?: Condition
    notes?: string
    imageUrls?: string[]
    measuredValue?: number | null
    textValue?: string | null
  }) => {
    const next = {
      condition: patch.condition ?? condition,
      notes: patch.notes ?? notes,
      imageUrls: patch.imageUrls ?? imageUrls,
      measuredValue:
        patch.measuredValue !== undefined ? patch.measuredValue : parseReading(measured),
      textValue: patch.textValue !== undefined ? patch.textValue : textValue || null,
    }
    onSaveState?.(item.id, 'saving')
    startSaving(async () => {
      const result = await updateInspectionItem(item.id, {
        condition: next.condition,
        // '' clears notes; the action turns it into null.
        notes: next.notes,
        imageUrls: next.imageUrls,
        measuredValue: next.measuredValue,
        textValue: next.textValue,
      })
      if (result.success) {
        onChanged(item.id, {
          condition: next.condition,
          photoCount: next.imageUrls.length,
        })
        onSaveState?.(item.id, 'saved')
      } else {
        onSaveState?.(item.id, 'error')
        toast.error(result.error || t('saveFailed'))
      }
    })
  }

  const applyCondition = (next: Condition, { focusNotes = true } = {}) => {
    if (isCompleted) return

    // Clearing a graded defect throws away its notes, so confirm first.
    if (next === 'not_inspected' && isDefect(condition) && notes.trim()) {
      setShowClearDialog(true)
      return
    }

    setCondition(next)

    if (isDefect(next)) {
      setShowNotes(true)
      if (notes.trim()) {
        setNotesRequired(false)
        save({ condition: next })
      } else {
        // Wait for the note before writing: a defect with no explanation is not
        // a usable record, and the certificate has to say what was wrong.
        setNotesRequired(true)
        if (focusNotes) setTimeout(() => notesRef.current?.focus(), 50)
      }
      return
    }

    setNotesRequired(false)
    save({ condition: next })
  }

  const handleNotesBlur = () => {
    if (isCompleted) return
    if (notesRequired) {
      if (notes.trim()) {
        setNotesRequired(false)
        save({ notes })
      }
      return
    }
    if (notes === (item.notes ?? '')) return
    save({ notes })
  }

  const handleMeasurementBlur = () => {
    if (isCompleted) return
    const value = parseReading(measured)
    if (value === null) {
      save({ measuredValue: null })
      return
    }

    // A reading outside the template's range grades itself, so the technician
    // records the number once instead of typing it and then also picking a grade.
    const graded = gradeMeasurement(value, {
      minValue: item.minValue,
      maxValue: item.maxValue,
      defaultSeverity: item.defaultSeverity,
    })
    if (graded && graded !== condition) {
      const severity = graded === 'pass' ? 'pass' : graded
      setCondition(severity)
      if (isDefect(severity)) setShowNotes(true)
      save({ measuredValue: value, condition: severity })
      return
    }
    save({ measuredValue: value })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || isCompleted) return

    setIsUploading(true)
    const uploaded: string[] = []
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/protected/upload/service-files', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (data.url) uploaded.push(data.url)
        else toast.error(data.error || t('uploadFailedFor', { name: file.name }))
      }
      if (uploaded.length > 0) {
        const next = [...imageUrls, ...uploaded]
        setImageUrls(next)
        save({ imageUrls: next })
      }
    } catch {
      toast.error(t('uploadFailed'))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = (index: number) => {
    if (isCompleted) return
    const next = imageUrls.filter((_, i) => i !== index)
    setImageUrls(next)
    save({ imageUrls: next })
  }

  /**
   * Applies a ready-made phrase. The note is appended rather than replaced so a
   * check with several faults can carry all of them, and the grade follows the
   * phrase because the Directive assigns the category, not the technician.
   */
  const applySuggestion = (suggestion: DefectSuggestion) => {
    if (isCompleted) return
    const existing = notes.trim()
    const nextNotes = existing ? `${existing}\n${suggestion.text}` : suggestion.text
    setNotes(nextNotes)
    setNotesRequired(false)
    setShowNotes(true)
    if (suggestion.severity !== condition) {
      setCondition(suggestion.severity)
      save({ condition: suggestion.severity, notes: nextNotes })
      return
    }
    save({ notes: nextNotes })
  }

  const describedBy = [
    item.description ? `${fieldId}-desc` : null,
    notesRequired ? `${fieldId}-notes-error` : null,
    needsPhoto ? `${fieldId}-photo-error` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      className={`rounded-lg border p-3 transition-colors ${
        isDefect(condition) ? token.soft : 'bg-card'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p
            id={nameId}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-medium"
          >
            {item.code && (
              <span className="text-muted-foreground font-mono text-xs">{item.code}</span>
            )}
            <span>{item.name}</span>
            {item.required && (
              <span className="text-muted-foreground text-xs font-normal">{t('required')}</span>
            )}
            {isSaving && (
              <>
                <Loader2
                  className="text-muted-foreground h-3 w-3 animate-spin"
                  aria-hidden="true"
                />
                <span className="sr-only">{t('saving')}</span>
              </>
            )}
          </p>
          {item.description && (
            <p id={`${fieldId}-desc`} className="text-muted-foreground mt-0.5 text-xs">
              {item.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <GradeControl
            value={condition}
            scale={scale}
            country={country}
            labelledBy={nameId}
            disabled={isCompleted}
            onChange={applyCondition}
          />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              aria-expanded={showNotes}
              onClick={() => setShowNotes((v) => !v)}
            >
              {showNotes ? t('hideNote') : t('addNote')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={isCompleted || isUploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('addPhoto', { name: item.name })}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={handleUpload}
            />
          </div>
        </div>
      </div>

      {/* {t("recordedValue")} */}
      {inputType === 'measurement' && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor={`${fieldId}-value`} className="text-muted-foreground text-xs">
              {item.unit ? t('readingUnit', { unit: item.unit }) : t('reading')}
            </label>
            <Input
              id={`${fieldId}-value`}
              inputMode="decimal"
              value={measured}
              onChange={(e) => setMeasured(e.target.value)}
              onBlur={handleMeasurementBlur}
              disabled={isCompleted}
              aria-describedby={describedBy || undefined}
              className="h-11 w-32"
            />
          </div>
          {range && (
            <p className="text-muted-foreground pb-3 text-xs">
              <span className="font-medium">{t('limit', { range })}</span>
            </p>
          )}
        </div>
      )}

      {inputType === 'text' && (
        <div className="mt-3 space-y-1">
          <label htmlFor={`${fieldId}-text`} className="text-muted-foreground text-xs">
            {t('recordedValue')}
          </label>
          <Input
            id={`${fieldId}-text`}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={() =>
              !isCompleted && textValue !== (item.textValue ?? '') && save({ textValue })
            }
            disabled={isCompleted}
            className="h-11"
          />
        </div>
      )}

      {inputType === 'choice' && (item.choices?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-1">
          <label htmlFor={`${fieldId}-choice`} className="text-muted-foreground text-xs">
            {t('answer')}
          </label>
          <Select
            value={textValue || undefined}
            disabled={isCompleted}
            onValueChange={(v) => {
              setTextValue(v)
              save({ textValue: v })
            }}
          >
            <SelectTrigger id={`${fieldId}-choice`} className="h-11 w-full sm:w-64">
              <SelectValue placeholder={t('selectAnswer')} />
            </SelectTrigger>
            <SelectContent>
              {item.choices?.map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {choice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showNotes && (
        <div className="mt-3 space-y-1">
          <label htmlFor={`${fieldId}-notes`} className="sr-only">
            {t('notesFor', { name: item.name })}
          </label>
          <Textarea
            id={`${fieldId}-notes`}
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            disabled={isCompleted}
            aria-invalid={notesRequired}
            aria-describedby={describedBy || undefined}
            placeholder={notesRequired ? t('describeDefect') : t('optionalNote')}
            className={`min-h-[68px] text-sm ${
              notesRequired ? 'border-destructive focus-visible:ring-destructive' : ''
            }`}
          />
          {notesRequired && (
            <p id={`${fieldId}-notes-error`} className="text-destructive text-xs">
              {t('notesRequired')}
            </p>
          )}
          {!isCompleted && (
            <DefectSuggestions
              check={{
                name: item.name,
                code: item.code,
                sectionCode: item.sectionCode,
                defectSuggestions: item.defectSuggestions,
              }}
              scale={scale}
              currentCondition={condition}
              history={history}
              onPick={applySuggestion}
            />
          )}
        </div>
      )}

      {needsPhoto && (
        <p id={`${fieldId}-photo-error`} className="text-destructive mt-2 text-xs">
          {t('photoRequired')}
        </p>
      )}

      {imageUrls.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {imageUrls.map((url, index) => (
            <li key={url} className="relative">
              {isVideo(url) ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={url} controls className="h-28 max-w-xs rounded-lg border" />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenImage(url)}
                  className="focus-visible:ring-ring block overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  aria-label={t('viewPhoto', { index: index + 1, name: item.name })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={t('photoAlt', { name: item.name, index: index + 1 })}
                    className="h-20 w-20 object-cover"
                  />
                </button>
              )}
              {!isCompleted && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  onClick={() => handleRemoveFile(index)}
                  aria-label={t('removePhoto', { index: index + 1, name: item.name })}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clearTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('clearBody', { name: item.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCondition('not_inspected')
                setNotesRequired(false)
                setShowNotes(false)
                setNotes('')
                setShowClearDialog(false)
                save({ condition: 'not_inspected', notes: '' })
              }}
            >
              {t('clear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
