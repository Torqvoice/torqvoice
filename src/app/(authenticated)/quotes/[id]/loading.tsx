import { Skeleton } from '@/components/ui/skeleton'

/** One labelled field of the quote's side column: a small label over an input. */
function FieldSkeleton({ label = 'w-16' }: { label?: string }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className={`h-3 ${label}`} />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}

/**
 * A line editor (parts or labor): its title and buttons, then input rows.
 * `grid` is the row's whole class list, written out so Tailwind sees it.
 */
function LinesSkeleton({ grid, cells, title }: { grid: string; cells: number; title: string }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className={`h-4 ${title}`} />
        <div className="flex gap-2">
          <Skeleton className="hidden h-8 w-36 sm:block" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className={grid}>
          {Array.from({ length: cells }).map((_, j) => (
            <Skeleton key={j} className="h-9" />
          ))}
          <Skeleton className="h-9 w-9" />
        </div>
      ))}
    </div>
  )
}

/**
 * The quote's shape while it loads: the title bar with its actions, the tabs,
 * then the parts, labor and notes beside the customer, details and totals,
 * stacked into one column below the large breakpoint like the page.
 */
export default function QuoteLoading() {
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-48" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-4 w-4 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                <Skeleton className="h-5 w-48 max-w-full" />
              </div>
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <div className="hidden gap-px sm:flex">
              {['w-24', 'w-16', 'w-20', 'w-20', 'w-20'].map((width, i) => (
                <Skeleton key={i} className={`h-8 ${width}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-1 border-b px-4">
          {['w-20', 'w-20', 'w-24'].map((width, i) => (
            <div key={i} className="border-b-2 border-transparent px-3 py-2.5">
              <Skeleton className={`h-4 ${width}`} />
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] lg:gap-4">
            <div className="flex min-w-0 flex-col gap-3">
              <LinesSkeleton
                title="w-16"
                cells={7}
                grid="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_2fr_0.6fr_0.9fr_0.7fr_0.9fr_0.9fr_auto]"
              />
              <LinesSkeleton
                title="w-20"
                cells={4}
                grid="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              />
              <div className="overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between px-3 py-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-[120px]" />
                </div>
                <div className="space-y-2.5 border-t p-3">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-11/12" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="border-t px-3 py-2">
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="rounded-lg border p-3">
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <FieldSkeleton label="w-16" />
                <FieldSkeleton label="w-14" />
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <Skeleton className="h-4 w-20" />
                <FieldSkeleton label="w-10" />
                <FieldSkeleton label="w-12" />
                <FieldSkeleton label="w-20" />
              </div>
              <div className="space-y-2.5 rounded-lg border p-3">
                <Skeleton className="h-4 w-16" />
                {['w-16', 'w-14', 'w-20', 'w-12'].map((width, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className={`h-3 ${width}`} />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-2.5">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
