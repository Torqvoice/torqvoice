import { useRouter } from 'next/navigation'
import type { DesignAutoRule } from '@/features/invoice-designer/Lib/designRules'
import { useTranslations } from 'next-intl'
import { MessageSquare } from 'lucide-react'
import { SharedLinkCard } from '@/components/shared-link-card'
import { InvoiceDetailsSection, type DesignOption } from '../service-edit/InvoiceDetailsSection'
import { BasicInfoSection } from '../service-edit/BasicInfoSection'
import { ScheduleTimesSection } from '../service-edit/ScheduleTimesSection'
import { TotalsSection } from '../service-edit/TotalsSection'
import { ServiceAttachments } from '../service-detail/ServiceAttachments'
import { CustomFieldsForm } from '@/features/custom-fields/Components/CustomFieldsForm'
import { WarrantySection } from './WarrantySection'
import { VideoCallSection } from './VideoCallSection'
import type { ServiceVideoCall } from '@/features/integrations/Actions/integrationActions'
import { revokePublicLink } from '@/features/vehicles/Actions/serviceActions'
import type { useServiceFormState } from './useServiceFormState'
import type { useServiceActions } from './useServiceActions'
import type { ServiceDetail } from '../service-detail/types'
import type { BoardTechnicianOption, OrgMemberOption, WorkBayOption } from './service-page-types'

interface DetailsRightColumnProps {
  formState: ReturnType<typeof useServiceFormState>
  actions: ReturnType<typeof useServiceActions>
  record: ServiceDetail
  vehicleId: string | null
  organizationId: string
  currencyCode: string
  taxEnabled: boolean
  initialVehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  boardTechnicians: BoardTechnicianOption[]
  workBays?: WorkBayOption[]
  orgMembers?: OrgMemberOption[]
  notificationHistory?: {
    id: string
    body: string
    status: string
    createdAt: string
    toNumber: string
  }[]
  videoCall?: ServiceVideoCall
  designOptions?: DesignOption[]
  designFollowsName?: string | null
  designPinnedAt?: string | null
  designFollowsRule?: DesignAutoRule | null
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
  workBays,
  orgMembers,
  notificationHistory = [],
  videoCall,
  designOptions = [],
  designFollowsName = null,
  designPinnedAt = null,
  designFollowsRule = null,
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
      <InvoiceDetailsSection
        initialData={formState.initialData}
        showType={!!record.vehicle}
        type={formState.type}
        setType={formState.dirtySetType}
        status={formState.status}
        setStatus={formState.dirtySetStatus}
        onDirty={formState.markDirty}
        paymentStatus={formState.paymentStatus}
        onTogglePaid={actions.handleTogglePaid}
        paymentLoading={actions.paymentLoading}
        designOptions={designOptions}
        designId={record.designId ?? null}
        designFollowsName={designFollowsName}
        designPinnedAt={designPinnedAt}
        designFollowsRule={designFollowsRule}
      />
      <BasicInfoSection
        initialData={formState.initialData}
        vehicleId={vehicleId}
        vehicleName={formState.vehicleName}
        selectedVehicleId={formState.selectedVehicleId}
        setSelectedVehicleId={formState.dirtySetSelectedVehicleId}
        techName={formState.techName}
        customer={record.customer ?? record.vehicle?.customer}
        initialVehicle={initialVehicle}
      />
      <ScheduleTimesSection
        serviceRecordId={record.id}
        technicians={boardTechnicians}
        workBays={workBays}
        orgMembers={orgMembers}
        initialStartDateTime={formState.initialData.startDateTime}
        initialEndDateTime={formState.initialData.endDateTime}
        initialTechnicianId={record.technicianId}
        initialWorkBayId={record.workBayId}
        onSaved={formState.flashSaved}
      />
      {videoCall && (
        <VideoCallSection
          serviceRecordId={record.id}
          videoCall={videoCall}
          scheduled={Boolean(formState.initialData.startDateTime)}
        />
      )}
      <TotalsSection
        partsSubtotal={formState.partsSubtotal}
        partsCostSubtotal={formState.partsCostSubtotal}
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
        taxInclusive={formState.taxInclusive}
        totalAmount={formState.totalAmount}
        currencyCode={currencyCode}
      />
      <WarrantySection
        warrantyMonths={formState.warrantyMonths}
        warrantyMileage={formState.warrantyMileage}
        warrantyNotes={formState.warrantyNotes}
        serviceDate={formState.initialData.serviceDate}
        onWarrantyMonthsChange={formState.dirtySetWarrantyMonths}
        onWarrantyMileageChange={formState.dirtySetWarrantyMileage}
        onWarrantyNotesChange={formState.dirtySetWarrantyNotes}
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
      {notificationHistory.length > 0 && (
        <NotificationHistory notifications={notificationHistory} />
      )}
    </div>
  )
}

function NotificationHistory({
  notifications,
}: {
  notifications: { id: string; body: string; status: string; createdAt: string; toNumber: string }[]
}) {
  const t = useTranslations('service.notifications')

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('justNow')
    if (mins < 60) return t('minutesAgo', { count: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    return t('daysAgo', { count: days })
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>
      <div className="space-y-2">
        {notifications.map((n) => (
          <div key={n.id} className="text-xs">
            <p className="text-muted-foreground">
              {timeAgo(n.createdAt)} · {t('viaSms')}
            </p>
            <p className="mt-0.5 truncate">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
