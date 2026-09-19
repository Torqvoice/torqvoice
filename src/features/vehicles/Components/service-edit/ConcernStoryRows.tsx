'use client'

import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useFormatDate } from '@/lib/use-format-date'
import { concernSteps } from '@/features/vehicles/Lib/concernStory'
import type { ConcernRow } from './form-types'
import { ConcernMedia, type ConcernMediaFile } from './ConcernMedia'
import { DictateButton } from './DictateButton'

export interface ConcernFinding {
  id: string
  description: string
  severity: string
  status: string
  notes: string | null
  concernId?: string | null
}

interface ConcernStoryRowsProps {
  rows: ConcernRow[]
  /** True while the only row is the blank one kept ready to type into. */
  unwritten: boolean
  hasBlankRow: boolean
  onPatch: (index: number, patch: Partial<ConcernRow>) => void
  onRemove: (index: number) => void
  onAdd: () => void
  findings: ConcernFinding[]
  onAddFinding?: (concernId: string) => void
  onEditFinding?: (finding: ConcernFinding) => void
  /** The job, and its files: media is filed under a concern from its row. */
  serviceRecordId?: string
  media?: ConcernMediaFile[]
  /** Dictation can go through the workshop's AI vendor. */
  serverTranscription?: boolean
  dictationMode?: 'ai' | 'choice'
}

// One fixed height for every step's label row, so the four boxes start on the
// same line whether or not a row carries a button beside its label.
const stepLabel =
  'flex h-5 items-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const stepField = 'field-sizing-content min-h-20 w-full resize-y text-sm'

const severityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  needs_work: 'bg-amber-500',
  monitor: 'bg-blue-500',
}

const STEPS = ['condition', 'cause', 'correction', 'confirm'] as const

/**
 * One concern told from start to finish: what the state of the vehicle was,
 * what testing showed the cause to be, what was done, and how it was checked.
 * Four fields side by side where there is room, because they are read as one
 * sentence; one row per concern, because two complaints are two stories.
 *
 * The cause is a sentence for the customer. The structured findings, with
 * their severity and photographs, stay what they were and are listed under it.
 * "Confirmed" is a tick: the server puts the name and the time on it when the
 * job is saved, so nobody can confirm in somebody else's name.
 */
export function ConcernStoryRows({
  rows,
  unwritten,
  hasBlankRow,
  onPatch,
  onRemove,
  onAdd,
  findings,
  onAddFinding,
  onEditFinding,
  serviceRecordId,
  media = [],
  serverTranscription = false,
  dictationMode = 'choice',
}: ConcernStoryRowsProps) {
  const t = useTranslations('service.concerns')
  const { formatDateTime } = useFormatDate()

  return (
    <div className="space-y-4">
      {rows.map((concern, index) => {
        const steps = concernSteps(concern)
        const linked = concern.id ? findings.filter((f) => f.concernId === concern.id) : []
        const number = index + 1
        return (
          <div
            key={concern.id ?? `new-${index}`}
            data-testid="concern-story"
            className={cn('space-y-2', index > 0 && 'border-t border-card-edge/60 pt-4')}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {String(number).padStart(2, '0')}
                </span>
                {/* How far along this one is, a dot a step. */}
                <span className="flex items-center gap-1" aria-hidden="true">
                  {STEPS.map((step) => (
                    <span
                      key={step}
                      title={t(`steps.${step}`)}
                      className={cn(
                        'h-1.5 w-4 rounded-full',
                        steps[step]
                          ? step === 'confirm'
                            ? 'bg-emerald-500'
                            : 'bg-primary'
                          : 'bg-muted'
                      )}
                    />
                  ))}
                </span>
              </div>
              {!unwritten && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(index)}
                  aria-label={t('remove')}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
              {/* Not one <label> around it all: the mic is a button of its own,
                  and a click on it must not land in the box as well. */}
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex h-5 items-center justify-between gap-2">
                  <label
                    htmlFor={`concern-condition-${index}`}
                    className={cn(stepLabel, 'min-w-0 truncate whitespace-nowrap')}
                  >
                    1 · {t('steps.condition')}
                  </label>
                  <DictateButton
                    value={concern.description}
                    onChange={(description) => onPatch(index, { description })}
                    serverTranscription={serverTranscription}
                    allowBrowserChoice={dictationMode === 'choice'}
                    serviceRecordId={serviceRecordId}
                  />
                </div>
                <Textarea
                  id={`concern-condition-${index}`}
                  value={concern.description}
                  placeholder={t('conditionPlaceholder')}
                  onChange={(e) => onPatch(index, { description: e.target.value })}
                  className={stepField}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <label className="flex flex-col gap-1">
                  <span className={stepLabel}>2 · {t('steps.cause')}</span>
                  <Textarea
                    value={concern.cause ?? ''}
                    placeholder={t('causePlaceholder')}
                    onChange={(e) => onPatch(index, { cause: e.target.value })}
                    className={stepField}
                  />
                </label>
                {linked.length > 0 && (
                  <ul className="space-y-0.5">
                    {linked.map((finding) => (
                      <li key={finding.id}>
                        <button
                          type="button"
                          onClick={() => onEditFinding?.(finding)}
                          className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default"
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              severityDot[finding.severity] ?? 'bg-muted-foreground'
                            )}
                          />
                          <span className="truncate">{finding.description}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* A finding points at a saved concern, so the door opens once
                    the row has been saved and has an id to point at. */}
                {concern.id && onAddFinding && (
                  <button
                    type="button"
                    onClick={() => onAddFinding(concern.id as string)}
                    className="flex cursor-pointer items-center gap-1 self-start rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default"
                  >
                    <Plus className="h-3 w-3" />
                    {t('addFinding')}
                  </button>
                )}
              </div>

              <label className="flex min-w-0 flex-col gap-1">
                <span className={stepLabel}>3 · {t('steps.correction')}</span>
                <Textarea
                  value={concern.correction ?? ''}
                  placeholder={t('correctionPlaceholder')}
                  onChange={(e) => onPatch(index, { correction: e.target.value })}
                  className={stepField}
                />
              </label>

              <div className="flex min-w-0 flex-col gap-1">
                <label className="flex flex-col gap-1">
                  <span className={stepLabel}>4 · {t('steps.confirm')}</span>
                  <Textarea
                    value={concern.confirmation ?? ''}
                    placeholder={t('confirmPlaceholder')}
                    onChange={(e) => onPatch(index, { confirmation: e.target.value })}
                    className={stepField}
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                  <Checkbox
                    checked={Boolean(concern.confirmed)}
                    onCheckedChange={(checked) => onPatch(index, { confirmed: checked === true })}
                    data-testid="concern-confirmed"
                  />
                  {t('markConfirmed')}
                </label>
                {concern.confirmed && (
                  <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {concern.confirmedAt
                      ? concern.confirmedByName
                        ? t('confirmedBy', {
                            name: concern.confirmedByName,
                            date: formatDateTime(concern.confirmedAt),
                          })
                        : t('confirmedAt', { date: formatDateTime(concern.confirmedAt) })
                      : t('confirmedOnSave')}
                  </p>
                )}
              </div>
            </div>

            {/* Filed under a saved concern, so the door opens once the row
                has been saved and has an id to file things under. */}
            {concern.id && serviceRecordId && (
              <ConcernMedia
                serviceRecordId={serviceRecordId}
                concernId={concern.id}
                files={media.filter((file) => file.concernId === concern.id)}
              />
            )}
          </div>
        )
      })}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onAdd}
        disabled={hasBlankRow}
        className="h-7 px-2 text-xs text-muted-foreground"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t('add')}
      </Button>
    </div>
  )
}
