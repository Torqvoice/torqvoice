'use client'

import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export interface Notice {
  /** One id per kind of notice, so a second one replaces the first. */
  id: string
  icon: LucideIcon
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  dismissLabel: string
}

/**
 * A notice that needs the person to do one thing: reload, sign in again.
 *
 * Drawn in the app's own look rather than sonner's plain card, because these
 * are the moments the app talks about itself, and they should look like it:
 * the glass surface and icon tile of the upgrade dialog, and the primary
 * hairline the layout runs along the top of the window.
 */
export function NoticeToast({
  toastId,
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  dismissLabel,
}: Omit<Notice, 'id'> & { toastId: string | number }) {
  return (
    <div
      role="status"
      data-testid="notice-toast"
      className="glass relative w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl shadow-2xl"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(9rem_5rem_at_2.25rem_2rem,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary via-primary/35 to-transparent"
      />
      <div className="relative flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-b from-primary/15 to-primary/5 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] ring-1 ring-primary/25 ring-inset">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pr-5">
          <p className="font-semibold text-sm tracking-tight">{title}</p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">{description}</p>
          <Button size="sm" className="mt-3 h-7 px-3 text-xs" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={() => toast.dismiss(toastId)}
          className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** Shows a notice until it is acted on or dismissed. */
export function showNotice({ id, ...notice }: Notice) {
  return toast.custom((toastId) => <NoticeToast toastId={toastId} {...notice} />, {
    id,
    duration: Number.POSITIVE_INFINITY,
    // The card draws its own surface; sonner's would sit behind it
    unstyled: true,
  })
}
