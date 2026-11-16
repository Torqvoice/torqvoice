'use client'

import {
  type ComponentType,
  type CSSProperties,
  createContext,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react'
import { Ban, CircleAlert, CircleHelp, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogOverlay,
  AlertDialogPortal,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ConfirmIcon = ComponentType<{ className?: string }>

/** One thing the action touches: an invoice, a customer, a design. */
export interface ConfirmSubject {
  label: string
  /** Quiet text on the right: who it belongs to, an amount, a count. */
  detail?: string
  icon?: ConfirmIcon
}

/** A short line saying what happens next. A plain string gets a neutral icon. */
export type ConfirmConsequence = string | { text: string; icon?: ConfirmIcon; emphasis?: boolean }

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** The mark in the header. Defaults to a warning when destructive, a question otherwise. */
  icon?: ConfirmIcon
  /** Rows naming what is affected. Pass the first few and count the rest in `subjectMore`. */
  subject?: ConfirmSubject[]
  /** How many more things are affected than the rows in `subject` show. */
  subjectMore?: number
  consequences?: ConfirmConsequence[]
  /** Adds the shared "This cannot be undone." line under the consequences. */
  irreversible?: boolean
  /** A name the user must type before the action wakes. For the most dangerous deletes. */
  requireText?: string
  /**
   * Which button holds focus when the dialog opens, and so which one Enter
   * presses. Defaults to cancel for a destructive confirm and to the action
   * otherwise; a prompt that throws work away without being destructive
   * (leaving with unsaved changes) passes 'cancel'.
   */
  defaultFocus?: 'cancel' | 'confirm'
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}

/** How far the phone sheet must be dragged down before letting go cancels. */
const DRAG_TO_DISMISS_PX = 80

/**
 * The key that presses a button, drawn inside it. Only where there is a
 * keyboard: never on the phone sheet or a touch screen. Hidden from screen
 * readers, so the button is still announced by its label alone.
 */
function KeyHint({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="confirm-key-hint"
      className="hidden rounded px-1 py-0.5 font-mono text-[11px] leading-none font-medium opacity-75 ring-1 ring-current/30 ring-inset sm:[@media(hover:hover)_and_(pointer:fine)]:inline-block"
    >
      {children}
    </span>
  )
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({})
  const [typed, setTyped] = useState('')
  const [dragY, setDragY] = useState(0)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragStart = useRef<number | null>(null)
  const typeLabelId = useId()

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    setTyped('')
    setDragY(0)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    setOpen(false)
    resolveRef.current?.(value)
    resolveRef.current = null
  }, [])

  const destructive = Boolean(options.destructive)
  const focusTarget = options.defaultFocus ?? (destructive ? 'cancel' : 'confirm')
  const mustType = options.requireText?.trim()
  const typedMatches = !mustType || typed.trim().toLowerCase() === mustType.toLowerCase()
  // Enter presses whichever button has focus, so the hint goes on the action
  // only when focus opens there. In the type-to-confirm field Enter submits
  // once the name matches.
  const enterConfirms = mustType ? typedMatches : focusTarget === 'confirm'

  const Icon = options.icon ?? (destructive ? TriangleAlert : CircleHelp)
  const consequences: Exclude<ConfirmConsequence, string>[] = [
    ...(options.consequences ?? []).map((c) => (typeof c === 'string' ? { text: c } : c)),
    ...(options.irreversible
      ? [{ text: t('confirmDialog.irreversible'), icon: Ban, emphasis: true }]
      : []),
  ]
  const subject = options.subject ?? []
  const subjectHasIcons = subject.some((row) => row.icon)
  const more = options.subjectMore ?? 0

  // One colour drives the chip, the glow and the hairline. `--confirm-ink` is
  // that colour pulled toward the text colour, so a red icon still reads on a
  // dark card.
  const tone = {
    '--confirm-tone': destructive ? 'var(--destructive)' : 'var(--primary)',
    '--confirm-ink': 'color-mix(in oklab, var(--confirm-tone) 72%, var(--foreground))',
    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
    transition: dragStart.current === null ? undefined : 'none',
  } as CSSProperties

  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragStart.current = e.clientY
  }
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return
    setDragY(Math.max(0, e.clientY - dragStart.current))
  }
  const onGrabUp = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    if (dragY > DRAG_TO_DISMISS_PX) settle(false)
    else setDragY(0)
  }

  return (
    <ConfirmContext value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => !v && settle(false)}>
        <AlertDialogPortal>
          {/* Tapping outside is the safe answer, the same as Escape. */}
          <AlertDialogOverlay onClick={() => settle(false)} />
          <AlertDialogPrimitive.Content
            data-slot="confirm-dialog"
            data-tone={destructive ? 'destructive' : 'neutral'}
            style={tone}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              const target = mustType
                ? inputRef.current
                : focusTarget === 'confirm'
                  ? actionRef.current
                  : cancelRef.current
              target?.focus()
            }}
            className={cn(
              'bg-card text-card-foreground border-card-edge fixed z-50 flex flex-col overflow-hidden border outline-none duration-200',
              'shadow-[0_1px_2px_rgb(0_0_0/0.06),0_24px_48px_-20px_rgb(0_0_0/0.45)]',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              // Phone: a sheet on the bottom edge, so the buttons sit under the thumb.
              'max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[90dvh] max-sm:rounded-t-[1.375rem] max-sm:border-b-0',
              // Larger screens: the house card, centred.
              'sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:top-1/2 sm:left-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl'
            )}
          >
            {/* The sheen, centred on the chip like the house card's. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(9rem_5.5rem_at_2.4rem_2.2rem,color-mix(in_oklab,var(--confirm-tone)_9%,transparent),transparent_70%)]"
            />
            <div
              aria-hidden="true"
              data-slot="confirm-grab"
              onPointerDown={onGrabDown}
              onPointerMove={onGrabMove}
              onPointerUp={onGrabUp}
              onPointerCancel={onGrabUp}
              className="relative shrink-0 touch-none px-5 pt-2.5 pb-1 sm:hidden"
            >
              <div className="bg-muted-foreground/45 mx-auto h-1 w-10 rounded-full" />
            </div>

            <div className="relative flex shrink-0 items-center gap-3 px-5 pt-3 pb-3.5 sm:pt-4">
              <div
                data-slot="confirm-icon"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--confirm-tone)_12%,transparent),color-mix(in_oklab,var(--confirm-tone)_4%,transparent))] text-(--confirm-ink) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--confirm-tone)_22%,transparent),inset_0_1px_0_rgb(255_255_255/0.15)]"
              >
                <Icon className="size-[17px]" />
              </div>
              <AlertDialogPrimitive.Title className="font-display min-w-0 text-[15px] leading-snug font-semibold tracking-tight text-balance">
                {options.title || t('confirmDialog.title')}
              </AlertDialogPrimitive.Title>
            </div>
            {/* The house hairline: the tone under the chip, gone by the far edge. */}
            <div
              aria-hidden="true"
              className="relative h-px shrink-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--confirm-tone)_55%,transparent),var(--card-edge)_45%,transparent)]"
            />

            {/* Everything between the hairline and the buttons is the description
                a screen reader announces, in reading order. */}
            <AlertDialogPrimitive.Description asChild>
              <div className="relative min-h-0 flex-1 overflow-y-auto text-sm">
                {options.description && (
                  <p className="text-muted-foreground px-5 pt-4 pb-5 leading-relaxed">
                    {options.description}
                  </p>
                )}
                {subject.length > 0 && (
                  <ul
                    data-slot="confirm-subject"
                    className={cn(
                      'text-[13px]',
                      options.description && 'border-card-edge/45 border-t'
                    )}
                  >
                    {subject.map((row) => {
                      const RowIcon = row.icon
                      return (
                        <li
                          key={`${row.label}:${row.detail ?? ''}`}
                          className="border-card-edge/45 flex min-w-0 items-center gap-2.5 border-b px-5 py-2"
                        >
                          {RowIcon && (
                            <RowIcon className="text-muted-foreground size-[15px] shrink-0" />
                          )}
                          <span className="min-w-0 truncate font-medium">{row.label}</span>
                          {row.detail && (
                            <span className="text-muted-foreground ml-auto max-w-[55%] shrink-0 truncate tabular-nums">
                              {row.detail}
                            </span>
                          )}
                        </li>
                      )
                    })}
                    {more > 0 && (
                      <li
                        className={cn(
                          'text-muted-foreground border-card-edge/45 border-b py-2 pr-5',
                          subjectHasIcons ? 'pl-[2.8125rem]' : 'pl-5'
                        )}
                      >
                        {t('confirmDialog.andMore', { count: more })}
                      </li>
                    )}
                  </ul>
                )}
                {consequences.length > 0 && (
                  <ul
                    data-slot="confirm-consequences"
                    className="grid gap-1.5 px-5 pt-3.5 pb-4 text-[13px]"
                  >
                    {consequences.map((line) => {
                      const LineIcon = line.icon ?? CircleAlert
                      return (
                        <li
                          key={line.text}
                          className={cn(
                            'flex gap-2.5 leading-snug',
                            line.emphasis ? 'font-medium' : 'text-muted-foreground'
                          )}
                        >
                          <LineIcon className="mt-0.5 size-[15px] shrink-0 text-(--confirm-ink)" />
                          <span>{line.text}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {mustType && (
                  <div
                    className={cn(
                      'grid gap-1.5 px-5 pb-4 text-[13px]',
                      consequences.length > 0 ? 'pt-1' : 'pt-3.5'
                    )}
                  >
                    <label htmlFor={`${typeLabelId}-input`} id={typeLabelId}>
                      {t.rich('confirmDialog.typeToConfirm', {
                        text: mustType,
                        b: (chunks) => <b className="font-semibold">{chunks}</b>,
                      })}
                    </label>
                    <Input
                      ref={inputRef}
                      id={`${typeLabelId}-input`}
                      value={typed}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        // An Enter that accepts an input method's composition
                        // finishes the text; it is not an answer.
                        if (e.nativeEvent.isComposing || e.keyCode === 229) return
                        if (e.key === 'Enter' && typedMatches) {
                          e.preventDefault()
                          settle(true)
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </AlertDialogPrimitive.Description>

            <div className="border-card-edge/60 bg-muted/45 relative flex shrink-0 flex-col-reverse gap-2 border-t px-5 py-3 max-sm:pt-3.5 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:justify-end">
              <AlertDialogCancel ref={cancelRef} className="max-sm:h-11 max-sm:text-[15px]">
                <span>{options.cancelLabel || t('buttons.cancel')}</span>
                <KeyHint>Esc</KeyHint>
              </AlertDialogCancel>
              <AlertDialogAction
                ref={actionRef}
                disabled={!typedMatches}
                onClick={() => settle(true)}
                // The button's own destructive variant, not a class override: two
                // background utilities on one element are settled by stylesheet
                // order, which is how a red button ends up amber.
                variant={destructive ? 'destructive' : 'default'}
                className="max-sm:h-11 max-sm:text-[15px]"
              >
                <span>{options.confirmLabel || t('buttons.confirm')}</span>
                {enterConfirms && <KeyHint>↵</KeyHint>}
              </AlertDialogAction>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      </AlertDialog>
    </ConfirmContext>
  )
}
