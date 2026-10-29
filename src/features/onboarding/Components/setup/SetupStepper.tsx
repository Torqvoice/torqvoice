'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export const SETUP_STEPS = ['workshop', 'region', 'tax', 'ready'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** Where the owner is in the four steps; a step already seen can be revisited. */
export function SetupStepper({
  current,
  reached,
  onGo,
}: {
  current: SetupStep
  /** The furthest step opened so far. */
  reached: number
  onGo: (step: SetupStep) => void
}) {
  const t = useTranslations('onboarding.setup')
  const currentIndex = SETUP_STEPS.indexOf(current)
  return (
    <ol aria-label={t('stepsLabel')} className="flex flex-wrap gap-1.5">
      {SETUP_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex
        const isDone = index < currentIndex || (index <= reached && !isCurrent)
        const reachable = index <= reached && !isCurrent
        const badge = (
          <span
            className={cn(
              'inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs',
              isCurrent && 'bg-primary text-primary-foreground',
              isDone && 'bg-accent text-foreground',
              !isCurrent && !isDone && 'border border-border'
            )}
          >
            {isDone ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : index + 1}
          </span>
        )
        // On a phone only the current step is named on screen; the others keep
        // their names for screen readers.
        const label = (
          <span className={isCurrent ? undefined : 'sr-only sm:not-sr-only'}>
            {t(`steps.${step}`)}
          </span>
        )
        return (
          <li key={step}>
            {reachable ? (
              <button
                type="button"
                onClick={() => onGo(step)}
                className="flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-1.5 text-[13px] font-medium text-foreground transition-colors sm:pr-3 hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {badge}
                {label}
              </button>
            ) : (
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full py-1.5 pl-1.5 text-[13px]',
                  isCurrent ? 'pr-3' : 'pr-1.5 sm:pr-3',
                  isCurrent
                    ? 'bg-foreground font-semibold text-background'
                    : 'font-medium text-muted-foreground'
                )}
              >
                {badge}
                {label}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
