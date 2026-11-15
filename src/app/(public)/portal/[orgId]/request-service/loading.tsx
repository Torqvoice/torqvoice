import {
  PortalFormSkeleton,
  PortalLoadingFrame,
} from '@/features/portal/Components/PortalLoadingFrame'

export default function PortalBookLoading() {
  return (
    <PortalLoadingFrame>
      <PortalFormSkeleton />
    </PortalLoadingFrame>
  )
}
