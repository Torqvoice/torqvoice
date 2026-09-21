'use client'

import { useTranslations } from 'next-intl'
import { Check, PackageSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusMessageKeys } from '../../service-detail/types'

/**
 * The stages every job passes through. Waiting for parts is not one of them:
 * it is a hold on a job that is under way, and most jobs never have it. Drawn
 * as a fourth stage it was ticked as done on every completed job, including
 * the ones that never waited for anything.
 */
const STAGES = ['pending', 'in-progress', 'completed'] as const
const WAITING = 'waiting-parts'

/**
 * The job's status as a line it travels along: a marker for each stage, joined
 * by a track that fills behind the job as it moves. Stages that are done carry
 * a tick, the current one is the solid marker with its name in full weight,
 * and what is still ahead is an outline. No box around it: it is a property
 * of the page, not a card on it.
 *
 * Waiting for parts sits on the line as a hold beside "in progress": a pill
 * that is off until somebody sets it, amber while the job is held, and gone
 * back to off when work resumes. It is still one of the four statuses the
 * record stores; only the drawing changed.
 *
 * Clicking a stage sets the status exactly as the select on the classic page
 * does, saved with the rest of the form. It sits inside the form's fieldset,
 * so a locked invoice disables it with everything else.
 */
export function StatusStepper({
  status,
  onChange,
}: {
  status: string
  onChange: (status: string) => void
}) {
  const t = useTranslations('service')
  const waiting = status === WAITING
  // A held job is under way, so it stands where "in progress" does.
  const current = STAGES.indexOf((waiting ? 'in-progress' : status) as (typeof STAGES)[number])
  const waitingLabel = t(`basicInfo.statusOptions.${statusMessageKeys[WAITING]}`)

  return (
    <nav
      aria-label={t('modern.statusLabel')}
      data-testid="status-stepper"
      // Its own container: whether the other stages are named depends on the
      // room the stepper has, not on the width of the page around it.
      className="@container flex items-center px-1"
    >
      {STAGES.map((stage, i) => {
        const isCurrent = i === current
        const isDone = i < current
        const isLast = i === STAGES.length - 1
        // While the job is held, the hold is the current step and this stage
        // is where it is held.
        const isHeld = isCurrent && waiting
        const label = t(`basicInfo.statusOptions.${statusMessageKeys[stage]}`)
        return (
          <div key={stage} className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}>
            <button
              type="button"
              aria-current={isCurrent && !isHeld ? 'step' : undefined}
              // Named even where only its number shows, for screen readers and
              // for the tooltip on a stage whose label is cut short.
              aria-label={label}
              title={label}
              onClick={() => {
                if (!isCurrent || isHeld) onChange(stage)
              }}
              // Allowed to shrink, so a long label (or a longer language) is
              // cut with an ellipsis instead of running into the next stage.
              className="group/step flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-1 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors',
                  isCurrent &&
                    !isHeld &&
                    'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15',
                  isHeld &&
                    'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-400',
                  isDone && 'border-primary/60 bg-primary/15 text-primary',
                  !isCurrent &&
                    !isDone &&
                    'border-border text-muted-foreground group-hover/step:border-primary/60 group-hover/step:text-foreground group-disabled/step:group-hover/step:border-border group-disabled/step:group-hover/step:text-muted-foreground'
                )}
              >
                {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
              </span>
              {/* On a narrow screen only the current stage is named; the
                  markers still say how many there are and where the job is. */}
              <span
                className={cn(
                  'min-w-0 truncate py-px text-[13px] leading-none',
                  isCurrent && !isHeld
                    ? 'font-semibold text-foreground'
                    : 'hidden text-muted-foreground group-hover/step:text-foreground group-disabled/step:group-hover/step:text-muted-foreground @2xl:inline'
                )}
              >
                {label}
              </span>
            </button>

            {stage === 'in-progress' && (
              <button
                type="button"
                data-testid="status-waiting"
                aria-current={waiting ? 'step' : undefined}
                aria-pressed={waiting}
                aria-label={waitingLabel}
                title={waitingLabel}
                onClick={() => onChange(waiting ? 'in-progress' : WAITING)}
                className={cn(
                  'group/hold ml-1 flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-[12px] leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                  waiting
                    ? 'border-amber-500/50 bg-amber-500/15 font-semibold text-amber-700 ring-4 ring-amber-500/10 dark:text-amber-400'
                    : 'border-dashed border-border text-muted-foreground hover:border-amber-500/50 hover:text-foreground disabled:hover:border-border disabled:hover:text-muted-foreground'
                )}
              >
                <PackageSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {/* Named while it is on, and wherever there is room for it. */}
                <span className={cn('truncate', !waiting && 'hidden @2xl:inline')}>
                  {waitingLabel}
                </span>
              </button>
            )}

            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  'mx-2 h-0.5 min-w-4 flex-1 rounded-full transition-colors',
                  isDone ? 'bg-primary/60' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
