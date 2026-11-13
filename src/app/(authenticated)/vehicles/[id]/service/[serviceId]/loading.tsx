import { Skeleton } from '@/components/ui/skeleton'

/** A card of the work order page, as outlines: a heading and a few lines. */
function CardSkeleton({ lines, heading = 'w-32' }: { lines: string[]; heading?: string }) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <Skeleton className={`h-4 ${heading}`} />
      {lines.map((width, i) => (
        <Skeleton key={i} className={`h-3 ${width}`} />
      ))}
    </div>
  )
}

/**
 * The work order's shape while it loads: the title row, the status steps, the
 * job column (who and what, the concerns, the work) and the side column, so
 * opening a job from a vehicle shows a work order arriving, not the vehicle.
 */
export default function WorkOrderLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-48" />
      </header>
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-4 pt-0">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <div className="ml-auto flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-md" />
            ))}
          </div>
        </div>
        <Skeleton className="h-4 w-72" />
        <div className="flex items-center gap-3 py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-1.5 flex-1 rounded-full" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-28 rounded-md" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <CardSkeleton heading="w-36" lines={['w-full', 'w-11/12', 'w-2/3']} />
            <div className="rounded-xl border bg-card">
              <div className="flex items-center gap-3 border-b p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-8 w-28" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <CardSkeleton heading="w-40" lines={['w-full', 'w-full', 'w-3/4', 'w-1/2']} />
            <CardSkeleton heading="w-28" lines={['w-full', 'w-2/3']} />
          </div>
        </div>
      </div>
    </div>
  )
}
