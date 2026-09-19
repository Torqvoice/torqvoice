'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusMessageKeys } from '../../service-detail/types'

/** The order a job moves through, the same order the status select lists. */
const STAGES = ['pending', 'in-progress', 'waiting-parts', 'completed'] as const

/**
 * The job's status as a line it travels along: a marker for each stage, joined
 * by a track that fills behind the job as it moves. Stages that are done carry
 * a tick, the current one is the solid marker with its name in full weight,
 * and what is still ahead is an outline. No box around it: it is a property
 * of the page, not a card on it.
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
  const current = STAGES.indexOf(status as (typeof STAGES)[number])

  return (
    <nav
      aria-label={t('modern.statusLabel')}
      data-testid="status-stepper"
      className="flex items-center px-1"
    >
      {STAGES.map((stage, i) => {
        const isCurrent = i === current
        const isDone = i < current
        const isLast = i === STAGES.length - 1
        return (
          <div key={stage} className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}>
            <button
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => {
                if (!isCurrent) onChange(stage)
              }}
              className="group/step flex min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-md py-1 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors',
                  isCurrent &&
                    'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15',
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
                  'truncate text-[13px] leading-none',
                  isCurrent
                    ? 'font-semibold text-foreground'
                    : 'hidden text-muted-foreground group-hover/step:text-foreground group-disabled/step:group-hover/step:text-muted-foreground @2xl:inline'
                )}
              >
                {t(`basicInfo.statusOptions.${statusMessageKeys[stage]}`)}
              </span>
            </button>
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
