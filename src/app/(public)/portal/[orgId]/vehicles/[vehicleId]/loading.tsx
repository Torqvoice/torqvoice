import {
  PortalDetailSkeleton,
  PortalLoadingFrame,
} from '@/features/portal/Components/PortalLoadingFrame'

/** Inside the portal's frame, so the header and the navigation do not jump. */
export default function PortalVehicleLoading() {
  return (
    <PortalLoadingFrame title={false}>
      <PortalDetailSkeleton />
    </PortalLoadingFrame>
  )
}
