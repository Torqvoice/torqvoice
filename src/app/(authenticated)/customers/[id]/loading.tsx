import { Skeleton } from '@/components/ui/skeleton'

/**
 * The customer page's shape while it loads: the name with its contact row and
 * edit button, the tab strip, and the vehicles list the page opens on.
 */
export default function CustomerDetailLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-48" />
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="space-y-6">
          <div>
            <Skeleton className="mb-4 h-4 w-36" />
            <div className="flex items-start gap-4">
              <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-3 pt-1">
                <Skeleton className="h-7 w-56 max-w-full" />
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-52" />
                </div>
              </div>
              <Skeleton className="h-9 w-9 shrink-0 md:h-8 md:w-32" />
            </div>
          </div>

          <div>
            <div className="mb-4 flex gap-1 overflow-hidden border-b">
              {['w-24', 'w-24', 'w-20'].map((width, i) => (
                <div key={i} className="border-b-2 border-transparent px-4 py-3">
                  <Skeleton className={`h-4 ${width}`} />
                </div>
              ))}
            </div>
            <div className="mb-3 flex justify-end">
              <Skeleton className="h-9 w-9 md:h-8 md:w-28" />
            </div>

            <div className="space-y-2 md:hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2.5 rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden rounded-lg border md:block">
              <div className="grid h-10 grid-cols-[120px_minmax(0,1fr)_100px_80px] items-center border-b">
                <Skeleton className="mx-2 h-4 w-12" />
                <Skeleton className="mx-2 h-4 w-16" />
                <Skeleton className="ml-auto mr-2 h-4 w-14" />
                <Skeleton className="mx-auto h-4 w-14" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[120px_minmax(0,1fr)_100px_80px] items-center border-b py-2.5 last:border-0"
                >
                  <Skeleton className="mx-2 h-4 w-16" />
                  <Skeleton className="mx-2 h-4 w-48 max-w-[80%]" />
                  <Skeleton className="ml-auto mr-2 h-4 w-16" />
                  <Skeleton className="mx-auto h-4 w-6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
