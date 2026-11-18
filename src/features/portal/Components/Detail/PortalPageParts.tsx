/**
 * The parts every inner page of the portal is built from: the page heading,
 * the back link, a status in its one colour, a list drawn as cards on a phone
 * and as a table above it, a block of facts, and the sentence for a page that
 * could not be read.
 *
 * Plain function components without hooks, so pages (server components) and
 * client components both use them. They take every colour, corner and face
 * from the theme's variables (`portal-themes.css`): nothing here names one of
 * the app's own colours, which would be wrong in a dark portal theme.
 */
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { statusBadgeClass, type StatusKind } from '@/lib/status-colors'
import { PortalNotice } from '../Ui'

const join = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ')

/**
 * The heading of a page: where it leads back to, its name in the display
 * face, a badge beside the name, a line under it and its buttons on the
 * right (under the heading on a phone).
 */
export function PortalPageHead({
  title,
  description,
  back,
  badge,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  back?: { href: string; label: string }
  badge?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="p-muted -ml-1 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-sm font-medium hover:underline"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="p-display break-words text-[28px] sm:text-[34px]">{title}</h1>
          {badge}
        </div>
        {description && <p className="p-muted mt-1.5 text-[15px] leading-normal">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>}
    </header>
  )
}

/**
 * A work order, quote or inspection status, in the one colour that status has
 * everywhere in the app (src/lib/status-colors.ts), drawn in the portal's
 * badge shape. The colour is carried by the tint and by a dot; the words are
 * always in the theme's ink, so they read on a dark theme and on a white one
 * whatever the hue.
 */
export function PortalStatus({
  kind,
  status,
  className,
  children,
}: {
  kind: StatusKind
  status: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      data-status={status}
      className={join('p-badge', statusBadgeClass(kind, status), className)}
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-current" />
      <span className="p-ink">{children}</span>
    </span>
  )
}

/** Where an invoice stands, as the customer reads it. */
export type PortalPaymentMark = 'paid' | 'partial' | 'unpaid' | 'overdue'

/**
 * Whether an invoice is paid, as a status and never as a button: nothing here
 * is filled with the workshop's colour, which is what the page's actions
 * wear. Paid has the theme's green dot, overdue is the theme's warning box,
 * unpaid is a plain quiet badge and partly paid an outlined one. The words
 * are the theme's ink (or its warning colour), so each reads in every theme.
 */
export function PortalPaymentBadge({
  state,
  children,
}: {
  state: PortalPaymentMark
  children: React.ReactNode
}) {
  const look =
    state === 'overdue'
      ? 'p-badge p-badge--danger'
      : state === 'partial'
        ? 'p-badge p-badge--outline'
        : 'p-badge'
  return (
    <span data-payment={state} className={look}>
      {state === 'paid' && (
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--p-open)]" />
      )}
      {children}
    </span>
  )
}

/** A page, or part of one, that could not be read: said plainly, in a box. */
export function PortalLoadFailed({ children }: { children: React.ReactNode }) {
  return <PortalNotice role="alert">{children}</PortalNotice>
}

/* ── A list: cards on a phone, a table from 768 px ─────────────────────── */

/** The phone's stack of cards. Each `PortalCard` is one `<li>`. */
export function PortalCardList({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-2.5 md:hidden">{children}</ul>
}

/**
 * One card. Put a `PortalStretchLink` in it to make the whole card open
 * something; anything else that must stay its own target gets
 * `className="relative z-10"`.
 */
export function PortalCard({ children }: { children: React.ReactNode }) {
  return <li className="p-panel relative p-4">{children}</li>
}

/** The one real link of a card or a table row, stretched over all of it. */
export function PortalStretchLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={join(
        'font-semibold after:absolute after:inset-0 after:rounded-[inherit] hover:underline',
        className
      )}
    >
      {children}
    </Link>
  )
}

/** The desk's table, in a panel. Hidden on a phone, where the cards show. */
export function PortalTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-panel p-panel--flush hidden md:block">
      <table className="w-full border-collapse text-left text-[15px]">{children}</table>
    </div>
  )
}

export function PortalTh({
  align,
  className,
  children,
}: {
  align?: 'right'
  className?: string
  children?: React.ReactNode
}) {
  return (
    <th
      scope="col"
      className={join(
        'p-label border-b px-5 py-3.5 font-semibold',
        align === 'right' && 'text-right',
        className
      )}
    >
      {children}
    </th>
  )
}

/** A row. `relative`, so a `PortalStretchLink` in one cell covers the row. */
export function PortalTr({ children }: { children: React.ReactNode }) {
  return <tr className="relative border-b last:border-b-0 hover:bg-[var(--p-soft)]">{children}</tr>
}

export function PortalTd({
  align,
  muted,
  className,
  children,
}: {
  align?: 'right'
  muted?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <td
      className={join(
        'px-5 py-4 align-middle',
        align === 'right' && 'text-right',
        muted && 'p-muted',
        className
      )}
    >
      {children}
    </td>
  )
}

/**
 * A list page on a desk: the list in the main column and, beside it, what the
 * customer most wants from it at a glance (what is left to pay, what waits
 * for an answer). On a phone that summary comes first, above the cards.
 * Without an `aside` the list simply spans the page.
 */
export function PortalListLayout({
  aside,
  children,
}: {
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  if (!aside) return <>{children}</>
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-7">
      <div className="order-2 min-w-0 lg:order-1">{children}</div>
      <aside className="order-1 flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--p-chrome-top)+24px)] lg:order-2">
        {aside}
      </aside>
    </div>
  )
}

/* ── Facts ─────────────────────────────────────────────────────────────── */

export interface PortalFact {
  label: string
  value: React.ReactNode
  /** The one to notice: what is left to pay, the day it is due. */
  strong?: boolean
}

/**
 * Label and value pairs: a column of rules beside a document on a desk
 * (`layout="rows"`), or a grid across the page (`layout="grid"`).
 */
export function PortalFacts({
  facts,
  layout = 'rows',
}: {
  facts: PortalFact[]
  layout?: 'rows' | 'grid'
}) {
  if (layout === 'grid') {
    return (
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="p-muted text-[13px]">{fact.label}</dt>
            <dd
              className={join('break-words text-base', fact.strong ? 'font-bold' : 'font-medium')}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <dl className="flex flex-col">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0"
        >
          {/* The label keeps its words whole and never gives way; the value
              takes what is left and wraps there. */}
          <dt className="p-muted max-w-[55%] shrink-0 text-sm">{fact.label}</dt>
          <dd
            className={join(
              'min-w-0 break-words text-right text-[15px]',
              fact.strong ? 'font-bold' : 'font-medium'
            )}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A detail page on a desk: the document on the left, its summary and buttons
 * in a column on the right that stays in view while the document scrolls. On
 * a phone the summary comes first, since that is what a customer opened the
 * page for, and the document follows.
 */
export function PortalDetailLayout({
  aside,
  children,
}: {
  aside: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="order-2 min-w-0 lg:order-1">{children}</div>
      <aside className="order-1 flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--p-chrome-top)+24px)] lg:order-2">
        {aside}
      </aside>
    </div>
  )
}
