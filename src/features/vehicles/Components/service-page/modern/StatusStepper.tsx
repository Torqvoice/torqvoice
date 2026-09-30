'use client'

import { useTranslations } from 'next-intl'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  STAGES,
  type Stage,
  WAITING_PARTS,
  type WorkOrderStatusOption,
  stageOf,
  statusColorClasses,
} from '@/features/work-order-statuses/Lib/stages'
import { statusMessageKeys } from '../../service-detail/types'

/** What the stepper shows as chosen under a stage: the built-in hold, or one of the workshop's own. */
type Chosen = { id: string; name: string; color: string } | null

/**
 * The job's status as a line it travels along: a marker for each of the three
 * stages, joined by a track that fills behind the job as it moves. Stages that
 * are done carry a tick, the current one is the solid marker with its name in
 * full weight, and what is still ahead is an outline. No box around it: it is
 * a property of the page, not a card on it.
 *
 * A stage that has statuses filed under it carries a small arrow. The menu
 * behind it lists them: "Waiting for parts", which the app has always had,
 * under "in progress", and whatever the workshop defined in settings under
 * the stage it chose. Picking one moves the job to that stage and names the
 * status in one step; the name then sits beside the stage in its own colour.
 * A stage with nothing under it has no arrow, so a workshop that defines no
 * statuses sees three stages and one arrow, and nothing else changes for it.
 *
 * It sits outside the form's lock: a locked invoice still moves along.
 */
export function StatusStepper({
  status,
  customStatus = null,
  options = [],
  onChange,
}: {
  status: string
  /** The workshop's own status the job carries, archived or not. */
  customStatus?: { id: string; name: string; color: string } | null
  /** The workshop's statuses that can be chosen. */
  options?: WorkOrderStatusOption[]
  /** A stage alone, or a stage with one of the workshop's statuses under it. */
  onChange: (status: string, custom: WorkOrderStatusOption | null) => void
}) {
  const t = useTranslations('service')
  const current = STAGES.indexOf(stageOf(status))
  const waitingLabel = t(`basicInfo.statusOptions.${statusMessageKeys[WAITING_PARTS]}`)

  const chosen: Chosen =
    status === WAITING_PARTS
      ? { id: WAITING_PARTS, name: waitingLabel, color: 'amber' }
      : customStatus

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
        const label = t(`basicInfo.statusOptions.${statusMessageKeys[stage]}`)
        const under = options.filter((option) => option.stage === stage)
        const hasMenu = under.length > 0 || stage === 'in-progress'
        const sub = isCurrent ? chosen : null
        const name = sub ? `${label}: ${sub.name}` : label
        return (
          <div key={stage} className={cn('flex min-w-0 items-center', !isLast && 'flex-1')}>
            <button
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              // Named even where only its number shows, for screen readers and
              // for the tooltip on a stage whose label is cut short.
              aria-label={name}
              title={name}
              onClick={() => {
                // Clicking the stage a status sits under goes back to the
                // plain stage, which is how a hold is lifted.
                if (!isCurrent || sub) onChange(stage, null)
              }}
              // Allowed to shrink, so a long label (or a longer language) is
              // cut with an ellipsis instead of running into the next stage.
              className="group/step flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-1 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
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
                  'min-w-0 truncate py-px text-[13px] leading-none',
                  isCurrent
                    ? 'font-semibold text-foreground'
                    : 'hidden text-muted-foreground group-hover/step:text-foreground group-disabled/step:group-hover/step:text-muted-foreground @2xl:inline'
                )}
              >
                {label}
              </span>
              {sub && (
                <span
                  data-testid="status-sub"
                  className={cn(
                    'min-w-0 truncate rounded-full border px-2 py-0.5 text-[12px] font-medium leading-none',
                    statusColorClasses(sub.color).chip
                  )}
                >
                  {sub.name}
                </span>
              )}
            </button>

            {hasMenu && (
              <StageMenu
                stage={stage}
                stageLabel={label}
                waitingLabel={waitingLabel}
                moreLabel={t('modern.moreStatuses')}
                under={under}
                chosenId={sub?.id ?? null}
                isCurrent={isCurrent}
                onChange={onChange}
              />
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

/** The arrow beside a stage, and the statuses filed under it. */
function StageMenu({
  stage,
  stageLabel,
  waitingLabel,
  moreLabel,
  under,
  chosenId,
  isCurrent,
  onChange,
}: {
  stage: Stage
  stageLabel: string
  waitingLabel: string
  moreLabel: string
  under: WorkOrderStatusOption[]
  chosenId: string | null
  isCurrent: boolean
  onChange: (status: string, custom: WorkOrderStatusOption | null) => void
}) {
  const row = 'flex cursor-pointer items-center gap-2 text-[13px]'
  const tick = (on: boolean) => (
    <Check className={cn('ml-auto h-3.5 w-3.5', on ? 'opacity-100' : 'opacity-0')} />
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`status-menu-${stage}`}
          // The same words on every arrow, on purpose: the stage's own button
          // is the one that carries its name.
          aria-label={moreLabel}
          title={moreLabel}
          className="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuItem className={row} onSelect={() => onChange(stage, null)}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          {stageLabel}
          {tick(isCurrent && chosenId === null)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {stage === 'in-progress' && (
          <DropdownMenuItem className={row} onSelect={() => onChange(WAITING_PARTS, null)}>
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', statusColorClasses('amber').dot)}
            />
            {waitingLabel}
            {tick(chosenId === WAITING_PARTS)}
          </DropdownMenuItem>
        )}
        {under.map((option) => (
          <DropdownMenuItem
            key={option.id}
            className={row}
            onSelect={() => onChange(stage, option)}
          >
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', statusColorClasses(option.color).dot)}
            />
            <span className="min-w-0 truncate">{option.name}</span>
            {tick(chosenId === option.id)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
