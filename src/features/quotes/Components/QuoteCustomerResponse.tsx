'use client'

import { Check, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormatDate } from '@/lib/use-format-date'

/**
 * What the customer said back, at the top of the quote.
 *
 * It used to sit in the right column below the details and the custom fields,
 * and below every line on a phone, so a workshop opening the quote from a
 * "Changes requested" notification had to scroll to find the one thing it came
 * for. It is not part of the form, so a locked quote leaves it usable.
 */
export function QuoteCustomerResponse({
  status,
  message,
  respondedAt,
  resolving,
  onResolve,
  t,
}: {
  status: 'changes_requested' | 'accepted' | string
  message: string
  respondedAt: Date
  resolving: boolean
  onResolve: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string
}) {
  // The workshop's zone, so the server's render and the browser's agree.
  const { formatDateTime } = useFormatDate()
  const changes = status === 'changes_requested'

  return (
    <div
      className={`rounded-lg border p-3 ${
        changes
          ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3
              className={`flex items-center gap-1.5 text-sm font-semibold ${
                changes
                  ? 'text-orange-700 dark:text-orange-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {changes ? t('page.changesRequested') : t('page.quoteAccepted')}
            </h3>
            <span
              className={`text-xs ${
                changes
                  ? 'text-orange-500 dark:text-orange-500'
                  : 'text-emerald-500 dark:text-emerald-500'
              }`}
            >
              {formatDateTime(respondedAt)}
            </span>
          </div>
          <p
            className={`whitespace-pre-line break-words text-sm ${
              changes
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            &ldquo;{message}&rdquo;
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={resolving}
          onClick={onResolve}
        >
          {resolving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1 h-3.5 w-3.5" />
          )}
          {t('page.markResolved')}
        </Button>
      </div>
    </div>
  )
}
