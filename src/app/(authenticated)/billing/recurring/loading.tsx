import { Skeleton } from '@/components/ui/skeleton'

/**
 * The recurring invoices page's shape while it loads: the billing switch and
 * the two actions, then one card down to the window's bottom holding the
 * invoices as cards on phones and a table from md up.
 */
export default function RecurringInvoicesLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-40" />
      </header>
      <div className="flex h-[calc(100svh-7.5rem)] min-h-0 flex-col gap-4 p-4 pt-0 md:h-[calc(100svh-4rem)]">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-36" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 md:h-8 md:w-32" />
            <Skeleton className="h-9 w-9 md:h-8 md:w-36" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card py-6">
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2.5 rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-48" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-9 w-9" />
                  <Skeleton className="h-9 w-9" />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden min-h-0 flex-1 flex-col md:flex">
            <div className="flex items-center border-b px-3 py-2">
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="grid h-10 grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.5fr)_4rem] items-center gap-4 border-b px-2">
              {['w-12', 'w-14', 'w-16', 'w-16', 'w-16', 'w-14', 'w-12', 'w-10'].map((width, i) => (
                <Skeleton key={i} className={`h-4 ${width} max-w-full`} />
              ))}
              <span />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.5fr)_4rem] items-center gap-4 border-b px-2 py-2"
              >
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-4 w-36 max-w-full" />
                <Skeleton className="h-4 w-24 max-w-full" />
                <Skeleton className="h-4 w-16 max-w-full" />
                <Skeleton className="h-4 w-20 max-w-full" />
                <Skeleton className="ml-auto h-4 w-16 max-w-full" />
                <Skeleton className="h-5 w-14 max-w-full rounded-full" />
                <Skeleton className="ml-auto h-4 w-6" />
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-7 w-7" />
                  <Skeleton className="h-7 w-7" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
