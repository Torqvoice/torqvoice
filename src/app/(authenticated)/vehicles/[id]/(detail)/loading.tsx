import { Skeleton } from '@/components/ui/skeleton'

/**
 * The vehicle page's shape while it loads: the vehicle on the left, the
 * history on the right, so nothing jumps when the real page arrives.
 */
export default function VehicleDetailLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-40" />
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid items-start gap-5 xl:grid-cols-[21.5rem_minmax(0,1fr)]">
          <div className="space-y-4 rounded-xl border bg-card p-3">
            <Skeleton className="aspect-[3/2] w-full rounded-lg" />
            <div className="space-y-2.5 px-1.5">
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="flex gap-1.5 px-1.5">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="space-y-3 border-t px-1.5 pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-1.5">
              {[16, 28, 24, 18, 20].map((w, i) => (
                <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
              ))}
              <Skeleton className="ml-auto h-8 w-20" />
            </div>
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="space-y-5 pt-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
