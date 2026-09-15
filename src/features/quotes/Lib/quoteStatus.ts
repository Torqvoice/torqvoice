/**
 * Every status a quote can hold, as the server's schema allows them.
 *
 * Screens used to print the stored value itself, so a workshop read
 * "changes_requested" in English whatever its language, and the word was wide
 * enough to spill out of the quotes table's status column.
 */
export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
  'changes_requested',
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/**
 * The status as a person reads it, from the `quotes.statusLabels` messages.
 * An unknown value is shown as it is rather than as a missing-message key.
 */
export function quoteStatusLabel(status: string, t: (key: QuoteStatus) => string): string {
  return (QUOTE_STATUSES as readonly string[]).includes(status) ? t(status as QuoteStatus) : status
}

/**
 * Statuses where the workshop has the next move: the customer asked for
 * changes, or accepted and the job has not been created yet. Only these are
 * highlighted, so the colour keeps meaning something in a long list.
 */
export const ATTENTION_STATUSES: QuoteStatus[] = ['changes_requested', 'accepted']

export function quoteNeedsAttention(status: string): boolean {
  return (ATTENTION_STATUSES as string[]).includes(status)
}

/**
 * The highlight for a row or card that needs attention, in its status colour.
 * A light tint for the row and a bar on its leading edge, which is what the eye
 * finds when scanning; the status badge still says it in words.
 */
export function attentionClasses(status: string): { row: string; edge: string; card: string } {
  if (status === 'changes_requested') {
    return {
      row: 'bg-orange-500/5 hover:bg-orange-500/10',
      edge: 'shadow-[inset_3px_0_0_var(--color-orange-500)]',
      card: 'border-l-[3px] border-l-orange-500 bg-orange-500/5',
    }
  }
  if (status === 'accepted') {
    return {
      row: 'bg-emerald-500/5 hover:bg-emerald-500/10',
      edge: 'shadow-[inset_3px_0_0_var(--color-emerald-500)]',
      card: 'border-l-[3px] border-l-emerald-500 bg-emerald-500/5',
    }
  }
  return { row: '', edge: '', card: '' }
}
