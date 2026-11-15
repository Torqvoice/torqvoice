import {
  PortalListSkeleton,
  PortalLoadingFrame,
} from '@/features/portal/Components/PortalLoadingFrame'

export default function PortalInvoicesLoading() {
  return (
    <PortalLoadingFrame>
      <PortalListSkeleton tabs />
    </PortalLoadingFrame>
  )
}
