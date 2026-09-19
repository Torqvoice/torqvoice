'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
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

const severityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  needs_work: 'bg-amber-500',
  monitor: 'bg-blue-500',
}

const STEPS = ['condition', 'cause', 'correction', 'confirm'] as const
type Step = (typeof STEPS)[number]

/** The text a step holds, whichever field of the concern it lives in. */
function textOf(concern: ConcernRow, step: Step): string {
  if (step === 'condition') return concern.description
  if (step === 'cause') return concern.cause ?? ''
  if (step === 'correction') return concern.correction ?? ''
  return concern.confirmation ?? ''
}

function patchFor(step: Step, text: string): Partial<ConcernRow> {
  if (step === 'condition') return { description: text }
  if (step === 'cause') return { cause: text }
  if (step === 'correction') return { correction: text }
  return { confirmation: text }
}

/** Where the work on a concern has got to: the first step nobody has done yet. */
function firstOpenStep(concern: ConcernRow): Step {
  const done = concernSteps(concern)
  return STEPS.find((step) => !done[step]) ?? 'confirm'
}

/**
 * One concern told from start to finish: what the state of the vehicle was,
 * what testing showed the cause to be, what was done, and how it was checked.
 *
 * The four steps are a strip across the card, each showing the first words of
 * what it holds, and one of them is open below at the card's full width. Four
 * boxes side by side gave each about 165px, which is no room to write a
 * sentence in, let alone dictate one; this way the step being worked on gets
 * all of it and the other three can still be read at a glance. A concern opens
 * on the first step that is not done, which is where the work is.
 *
 * The cause is a sentence for the customer. The structured observations, with
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
  // Which step each concern has open, once somebody has chosen; until then it
  // is the first one not done. Keyed by where the concern sits in the list: a
  // new concern has no id until it is saved.
  const [chosen, setChosen] = useState<Record<number, Step>>({})
  const confirm = useConfirm()

  /**
   * The cross takes a whole story with it: four steps of writing, and the
   * link to whatever was filed under it. So it asks first, unless the row is
   * still blank and there is nothing to lose.
   */
  const remove = async (index: number, concern: ConcernRow, attached: number) => {
    const written = STEPS.some((step) => textOf(concern, step).trim()) || concern.confirmed
    if (written || attached > 0) {
      const ok = await confirm({
        title: t('removeTitle'),
        description: attached > 0 ? `${t('removeBody')} ${t('removeAttached')}` : t('removeBody'),
        confirmLabel: t('removeConfirm'),
        destructive: true,
      })
      if (!ok) return
    }
    // The open steps are kept by position, and every position after this one moves up.
    setChosen({})
    onRemove(index)
  }

  return (
    <div className="space-y-5">
      {rows.map((concern, index) => {
        const done = concernSteps(concern)
        const open = chosen[index] ?? firstOpenStep(concern)
        const linked = concern.id ? findings.filter((f) => f.concernId === concern.id) : []
        const files = concern.id ? media.filter((file) => file.concernId === concern.id) : []
        const text = textOf(concern, open)
        const fieldId = `concern-${index}-${open}`
        return (
          <div
            key={concern.id ?? `new-${index}`}
            data-testid="concern-story"
            className={cn('space-y-2.5', index > 0 && 'border-t border-card-edge/60 pt-5')}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              {!unwritten && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void remove(index, concern, linked.length + files.length)}
                  aria-label={t('remove')}
                  className="ml-auto h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div role="tablist" className="grid grid-cols-2 gap-1.5 @xl:grid-cols-4">
              {STEPS.map((step, i) => {
                const preview = textOf(concern, step).trim()
                const counts =
                  step === 'condition' ? files.length : step === 'cause' ? linked.length : 0
                return (
                  <button
                    key={step}
                    type="button"
                    role="tab"
                    aria-selected={open === step}
                    data-testid={`concern-step-${step}`}
                    onClick={() => setChosen((prev) => ({ ...prev, [index]: step }))}
                    className={cn(
                      'min-w-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-default',
                      open === step
                        ? 'border-primary bg-primary/10'
                        : 'border-card-edge hover:border-primary/40 hover:bg-muted/40'
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          done[step]
                            ? step === 'confirm'
                              ? 'bg-emerald-500'
                              : 'bg-primary'
                            : 'bg-muted ring-1 ring-inset ring-border'
                        )}
                      />
                      <span className="truncate">
                        {i + 1} · {t(`steps.${step}`)}
                      </span>
                      {counts > 0 && (
                        <span className="ml-auto rounded bg-muted px-1 text-[10px] tabular-nums text-foreground">
                          {counts}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-xs',
                        preview ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {preview ||
                        (step === 'confirm' && concern.confirmed
                          ? t('markConfirmed')
                          : t('stepEmpty'))}
                    </span>
                  </button>
                )
              })}
            </div>

            <div role="tabpanel" className="space-y-2">
              <label htmlFor={fieldId} className="sr-only">
                {t(`steps.${open}`)}
              </label>
              {/* Keyed by step, so moving to another step shows that step's
                  words and not a box the browser is still holding the old
                  ones in. */}
              <Textarea
                key={fieldId}
                id={fieldId}
                value={text}
                placeholder={t(`${open}Placeholder`)}
                // Working in a step pins it. Otherwise the first letter typed
                // into an empty step makes it "done", the first step not done
                // becomes the next one, and the box changes under the typing.
                onFocus={() => setChosen((prev) => ({ ...prev, [index]: open }))}
                onChange={(e) => onPatch(index, patchFor(open, e.target.value))}
                className="field-sizing-content min-h-28 w-full resize-y text-sm"
              />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <DictateButton
                  key={fieldId}
                  value={text}
                  onChange={(next) => {
                    // Dictating pins the step as typing does.
                    setChosen((prev) => (prev[index] === open ? prev : { ...prev, [index]: open }))
                    onPatch(index, patchFor(open, next))
                  }}
                  serverTranscription={serverTranscription}
                  allowBrowserChoice={dictationMode === 'choice'}
                  serviceRecordId={serviceRecordId}
                />

                {/* Media and observations belong to the concern, not to one of
                    its steps, so they are here whichever step is open. Both
                    are filed under a saved concern: until the job has been
                    saved once there is nothing to file them under, and the
                    buttons say so rather than hide. */}
                {serviceRecordId && (
                  <ConcernMedia
                    serviceRecordId={serviceRecordId}
                    concernId={concern.id ?? null}
                    files={files}
                  />
                )}

                {linked.map((finding) => (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => onEditFinding?.(finding)}
                    className="flex max-w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        severityDot[finding.severity] ?? 'bg-muted-foreground'
                      )}
                    />
                    <span className="truncate">{finding.description}</span>
                  </button>
                ))}
                {onAddFinding && (
                  <button
                    type="button"
                    disabled={!concern.id}
                    title={concern.id ? undefined : t('saveFirst')}
                    onClick={() => concern.id && onAddFinding(concern.id)}
                    data-testid="concern-add-observation"
                    className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:text-muted-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    {t('addFinding')}
                  </button>
                )}
                {!concern.id && !unwritten && (
                  <span className="text-[11px] text-muted-foreground">{t('saveFirst')}</span>
                )}

                {open === 'confirm' && (
                  <>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                      <Checkbox
                        checked={Boolean(concern.confirmed)}
                        onCheckedChange={(checked) =>
                          onPatch(index, { confirmed: checked === true })
                        }
                        data-testid="concern-confirmed"
                      />
                      {t('markConfirmed')}
                    </label>
                    {concern.confirmed && (
                      <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {concern.confirmedAt
                          ? concern.confirmedByName
                            ? t('confirmedBy', {
                                name: concern.confirmedByName,
                                date: formatDateTime(concern.confirmedAt),
                              })
                            : t('confirmedAt', { date: formatDateTime(concern.confirmedAt) })
                          : t('confirmedOnSave')}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
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
