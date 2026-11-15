import {
  PortalListSkeleton,
  PortalLoadingFrame,
} from '@/features/portal/Components/PortalLoadingFrame'

export default function PortalQuotesLoading() {
  return (
    <PortalLoadingFrame>
      <PortalListSkeleton tabs />
    </PortalLoadingFrame>
  )
}
