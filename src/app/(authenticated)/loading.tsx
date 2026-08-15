import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-24" />
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Quick stats row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        {/* Customize toolbar */}
        <div className="flex justify-end">
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        {/* Card grid — mirrors the DashboardGrid pre-mount skeleton so the
            handoff from route loading to page render is seamless */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[480px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
