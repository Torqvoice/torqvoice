'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Step navigation for a multi-step flow, in the shadcn composition style:
 * a root that owns the current step and parts that read it from context.
 *
 * The root shows the map; the caller renders one step's content at a time.
 * Nothing here decides what a step contains.
 */

type StepperContextValue = {
  value: number
  setValue: (step: number) => void
  orientation: 'horizontal' | 'vertical'
}

const StepperContext = React.createContext<StepperContextValue | null>(null)

function useStepper() {
  const context = React.useContext(StepperContext)
  if (!context) {
    throw new Error('Stepper parts must be used inside <Stepper>')
  }
  return context
}

type StepItemContextValue = {
  step: number
  state: 'active' | 'completed' | 'inactive'
  disabled: boolean
  /** Outstanding work, drawn to be noticed rather than merely unfilled. */
  attention: boolean
}

const StepItemContext = React.createContext<StepItemContextValue | null>(null)

function useStepItem() {
  const context = React.useContext(StepItemContext)
  if (!context) {
    throw new Error('Stepper parts must be used inside <StepperItem>')
  }
  return context
}

function Stepper({
  value,
  onValueChange,
  orientation = 'horizontal',
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'onChange'> & {
  value: number
  onValueChange?: (step: number) => void
  orientation?: 'horizontal' | 'vertical'
}) {
  const setValue = React.useCallback((step: number) => onValueChange?.(step), [onValueChange])

  return (
    <StepperContext.Provider value={{ value, setValue, orientation }}>
      <div
        data-slot="stepper"
        data-orientation={orientation}
        className={cn(
          'group/stepper flex data-[orientation=vertical]:flex-col',
          orientation === 'horizontal' ? 'w-full items-start gap-2' : 'gap-2',
          className
        )}
        {...props}
      />
    </StepperContext.Provider>
  )
}

function StepperItem({
  step,
  completed = false,
  disabled = false,
  attention = false,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  step: number
  /** Marks a step done even when it is not the one behind the cursor. */
  completed?: boolean
  disabled?: boolean
  /** Marks a step as still needing something, whether or not it has been visited. */
  attention?: boolean
}) {
  const { value } = useStepper()
  const state: StepItemContextValue['state'] =
    completed || value > step ? 'completed' : value === step ? 'active' : 'inactive'

  return (
    <StepItemContext.Provider value={{ step, state, disabled, attention }}>
      <div
        data-slot="stepper-item"
        data-state={state}
        className={cn(
          'group/step flex items-center gap-2 group-data-[orientation=horizontal]/stepper:flex-1',
          'group-data-[orientation=vertical]/stepper:items-start',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
        {...props}
      />
    </StepItemContext.Provider>
  )
}

/** Makes a step clickable, for going back to something already done. */
function StepperTrigger({ className, children, ...props }: React.ComponentProps<'button'>) {
  const { setValue } = useStepper()
  const { step, disabled } = useStepItem()

  return (
    <button
      data-slot="stepper-trigger"
      type="button"
      disabled={disabled}
      onClick={() => setValue(step)}
      className={cn(
        'flex items-center gap-2.5 rounded-md text-left outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function StepperIndicator({ className, children, ...props }: React.ComponentProps<'span'>) {
  const { step, state, attention } = useStepItem()

  return (
    <span
      data-slot="stepper-indicator"
      data-state={state}
      data-attention={attention || undefined}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
        'data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground',
        // A ring rather than a bigger circle: it reads at a glance without
        // shifting the row it sits in.
        'data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:ring-4 data-[state=active]:ring-primary/20',
        // Done is green rather than another shade of the brand, so a finished
        // step and the one being worked on are told apart by colour and not
        // only by fill.
        'data-[state=completed]:border-emerald-600 data-[state=completed]:bg-emerald-600 data-[state=completed]:text-white',
        'dark:data-[state=completed]:border-emerald-500 dark:data-[state=completed]:bg-emerald-500 dark:data-[state=completed]:text-emerald-950',
        // Outstanding work stays amber, since the product is amber and another
        // hue shouted. What was missing was contrast, not colour: a filled
        // chip with a full-strength border and dark text, rather than the
        // tenth-opacity tint this used to be.
        'data-[attention]:data-[state=inactive]:border-amber-500 data-[attention]:data-[state=inactive]:bg-amber-100 data-[attention]:data-[state=inactive]:text-amber-900 data-[attention]:data-[state=inactive]:ring-4 data-[attention]:data-[state=inactive]:ring-amber-500/15',
        'dark:data-[attention]:data-[state=inactive]:bg-amber-500/25 dark:data-[attention]:data-[state=inactive]:text-amber-200',
        className
      )}
      {...props}
    >
      {children ?? step}
    </span>
  )
}

function StepperTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="stepper-title"
      className={cn('text-sm font-medium leading-tight', className)}
      {...props}
    />
  )
}

function StepperDescription({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="stepper-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

/** The line between two steps; it fills in once the earlier one is done. */
function StepperSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  const { state } = useStepItem()

  return (
    <div
      data-slot="stepper-separator"
      data-state={state}
      className={cn(
        'bg-border data-[state=completed]:bg-emerald-600/40 dark:data-[state=completed]:bg-emerald-500/40',
        'group-data-[orientation=horizontal]/stepper:h-px group-data-[orientation=horizontal]/stepper:flex-1',
        'group-data-[orientation=vertical]/stepper:ms-4 group-data-[orientation=vertical]/stepper:h-full group-data-[orientation=vertical]/stepper:w-px',
        className
      )}
      {...props}
    />
  )
}

export {
  Stepper,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperTitle,
  StepperDescription,
  StepperSeparator,
}
