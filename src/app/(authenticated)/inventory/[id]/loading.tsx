import { Skeleton } from '@/components/ui/skeleton'

/**
 * The part page's shape while it loads: the name and edit button, the four
 * stock and price tiles, then the stock history as cards on phones and a
 * table from md up, with the pager under it.
 */
export default function InventoryPartLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-48" />
      </header>
      <div className="space-y-6 p-4 pt-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-9 shrink-0 md:w-24" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {['w-16', 'w-14', 'w-16', 'w-16'].map((width, i) => (
            <div key={i} className="space-y-2 rounded-lg border bg-card px-3 py-2">
              <Skeleton className={`h-3 ${width}`} />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-9 w-full sm:w-[220px]" />
          </div>

          <div className="space-y-2 md:hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2.5 rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32 max-w-full" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden rounded-lg border md:block">
            <div className="grid h-10 grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 border-b px-2">
              {['w-12', 'w-14', 'w-14', 'w-16', 'w-14', 'w-8'].map((width, i) => (
                <Skeleton key={i} className={`h-4 ${width} max-w-full`} />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 border-b px-2 py-2.5 last:border-0"
              >
                <Skeleton className="h-4 w-28 max-w-full" />
                <Skeleton className="h-5 w-10 max-w-full rounded-full" />
                <Skeleton className="h-4 w-8 max-w-full" />
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-4 w-20 max-w-full" />
                <Skeleton className="h-4 w-16 max-w-full" />
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <Skeleton className="h-8 w-36" />
            <div className="flex items-center gap-1">
              <Skeleton className="hidden h-8 w-8 sm:block" />
              <Skeleton className="h-9 w-9 sm:h-8 sm:w-8" />
              <Skeleton className="mx-3 h-4 w-16" />
              <Skeleton className="h-9 w-9 sm:h-8 sm:w-8" />
              <Skeleton className="hidden h-8 w-8 sm:block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
