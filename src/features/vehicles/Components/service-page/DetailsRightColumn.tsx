import { useRouter } from 'next/navigation'
import { SharedLinkCard } from '@/components/shared-link-card'
import { BasicInfoSection } from '../service-edit/BasicInfoSection'
import { ScheduleTimesSection } from '../service-edit/ScheduleTimesSection'
import { TotalsSection } from '../service-edit/TotalsSection'
import { ServiceAttachments } from '../service-detail/ServiceAttachments'
import { CustomFieldsForm } from '@/features/custom-fields/Components/CustomFieldsForm'
import { revokePublicLink } from '@/features/vehicles/Actions/serviceActions'
import type { useServiceFormState } from './useServiceFormState'
import type { useServiceActions } from './useServiceActions'
import type { ServiceDetail } from '../service-detail/types'
import type { BoardTechnicianOption } from './service-page-types'

interface DetailsRightColumnProps {
  formState: ReturnType<typeof useServiceFormState>
  actions: ReturnType<typeof useServiceActions>
  record: ServiceDetail
  vehicleId: string
  organizationId: string
  currencyCode: string
  taxEnabled: boolean
  initialVehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null }
  boardTechnicians: BoardTechnicianOption[]
}

export function DetailsRightColumn({
  formState,
  actions,
  record,
  vehicleId,
  organizationId,
  currencyCode,
  taxEnabled,
  initialVehicle,
  boardTechnicians,
}: DetailsRightColumnProps) {
  const router = useRouter()

  return (
    <div className="space-y-3">
      {record.publicToken && (
        <SharedLinkCard
          publicToken={record.publicToken}
          organizationId={organizationId}
          type="invoice"
          sharedAt={record.sharedAt}
          viewCount={record.viewCount}
          lastViewedAt={record.lastViewedAt}
          onRevoke={async () => {
            await revokePublicLink(record.id)
            router.refresh()
          }}
        />
      )}
      <BasicInfoSection
        initialData={formState.initialData}
        vehicleId={vehicleId}
        vehicleName={formState.vehicleName}
        selectedVehicleId={formState.selectedVehicleId}
        setSelectedVehicleId={formState.dirtySetSelectedVehicleId}
        type={formState.type}
        setType={formState.dirtySetType}
        status={formState.status}
        setStatus={formState.dirtySetStatus}
        techName={formState.techName}
        customer={record.vehicle.customer}
        initialVehicle={initialVehicle}
      />
      <ScheduleTimesSection
        serviceRecordId={record.id}
        technicians={boardTechnicians}
        initialStartDateTime={formState.initialData.startDateTime}
        initialEndDateTime={formState.initialData.endDateTime}
        initialTechnicianId={record.technicianId}
        onSaved={formState.flashSaved}
      />
      <TotalsSection
        partsSubtotal={formState.partsSubtotal}
        laborSubtotal={formState.laborSubtotal}
        subtotal={formState.subtotal}
        discountType={formState.discountType}
        setDiscountType={formState.dirtySetDiscountType}
        discountValue={formState.discountValue}
        setDiscountValue={formState.dirtySetDiscountValue}
        discountAmount={formState.discountAmount}
        taxEnabled={taxEnabled}
        taxRate={formState.taxRate}
        setTaxRate={formState.dirtySetTaxRate}
        taxAmount={formState.taxAmount}
        totalAmount={formState.totalAmount}
        currencyCode={currencyCode}
      />
      <ServiceAttachments
        attachments={record.attachments || []}
        imageAttachments={formState.imageAttachments}
        onImageClick={actions.onImageClick}
        onDeleteAttachment={actions.handleDeleteAttachment}
        deletingAttachment={actions.deletingAttachment}
      />
      <CustomFieldsForm
        entityId={record.id}
        entityType="service_record"
        onValuesReady={formState.onCustomFieldsReady}
        onChange={formState.markDirty}
      />
    </div>
  )
}
