import { PortalLoadingFrame } from '@/features/portal/Components/PortalLoadingFrame'

export default function PortalHomeLoading() {
  return (
    <PortalLoadingFrame title={false}>
      <div className="space-y-4">
        <div className="p-skeleton h-44 w-full rounded-[var(--p-radius)]" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-skeleton h-40 rounded-[var(--p-radius)]" />
          <div className="p-skeleton h-40 rounded-[var(--p-radius)]" />
        </div>
      </div>
    </PortalLoadingFrame>
  )
}
