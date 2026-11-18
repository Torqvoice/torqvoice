import {
  PortalListSkeleton,
  PortalLoadingFrame,
} from '@/features/portal/Components/PortalLoadingFrame'

export default function PortalVehiclesLoading() {
  return (
    <PortalLoadingFrame>
      <PortalListSkeleton rows={3} />
    </PortalLoadingFrame>
  )
}
