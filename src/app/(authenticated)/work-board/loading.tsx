import { Skeleton } from "@/components/ui/skeleton";

export default function WorkBoardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>

      {/* Grid skeleton */}
      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-[140px_repeat(7,1fr)] gap-1">
            <div />
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
          {/* Tech rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[140px_repeat(7,1fr)] gap-1"
            >
              <Skeleton className="h-20" />
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-20" />
              ))}
            </div>
          ))}
        </div>
        {/* Unassigned panel skeleton */}
        <Skeleton className="h-96 w-64" />
      </div>
    </div>
  );
}
