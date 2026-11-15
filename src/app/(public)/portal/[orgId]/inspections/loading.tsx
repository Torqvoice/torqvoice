import {
  PortalListSkeleton,
  PortalLoadingFrame,
} from '@/features/portal/Components/PortalLoadingFrame'

export default function PortalInspectionsLoading() {
  return (
    <PortalLoadingFrame>
      <PortalListSkeleton tabs />
    </PortalLoadingFrame>
  )
}
