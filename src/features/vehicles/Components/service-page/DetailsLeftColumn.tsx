import { PartsEditor } from '../service-edit/PartsEditor'
import { LaborEditor } from '../service-edit/LaborEditor'
import { ConcernsSection } from '../service-edit/ConcernsSection'
import { NotesSection } from '../service-edit/NotesSection'
import { PaymentsSection } from '../service-detail/PaymentsSection'
import { InvoiceSummary } from '../service-detail/InvoiceSummary'
import { ServiceFindingsSection } from '../service-detail/ServiceFindingsSection'
import type { useServiceFormState } from './useServiceFormState'
import type { useServiceActions } from './useServiceActions'
import type { ServiceDetail } from '../service-detail/types'
import {
  TireSetBanner,
  type TireSetBannerData,
} from '@/features/tire-hotel/Components/TireSetBanner'
import { StoreTiresButton } from '@/features/tire-hotel/Components/StoreTiresButton'
import type { InventoryPartOption } from '../service-edit/form-types'

interface DetailsLeftColumnProps {
  formState: ReturnType<typeof useServiceFormState>
  actions: ReturnType<typeof useServiceActions>
  record: ServiceDetail
  /** Present only when the job came out of the tire hotel. */
  tireSet?: TireSetBannerData | null
  tireHotelEnabled?: boolean
  tireThresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
  unitSystem?: 'metric' | 'imperial'
  currencyCode: string
  defaultLaborRate: number
  inventoryParts: InventoryPartOption[]
  defaultMarkupPercent?: number
  markupAppliesToInventory?: boolean
  hasPresets?: boolean
  onOpenPresets?: () => void
  onScanBarcode?: () => void
  aiEnabled?: boolean
  vehicleId: string | null
  findings?: {
    id: string
    description: string
    severity: string
    status: string
    notes: string | null
    concernId?: string | null
  }[]
  onAddFinding?: () => void
  onEditFinding?: (finding: {
    id: string
    description: string
    severity: string
    status: string
    notes: string | null
  }) => void
  openObservationsCount?: number
  onShowExistingObservations?: () => void
}

export function DetailsLeftColumn({
  formState,
  actions,
  record,
  tireSet = null,
  tireHotelEnabled = false,
  tireThresholds,
  unitSystem = 'metric',
  currencyCode,
  defaultLaborRate,
  inventoryParts,
  defaultMarkupPercent = 0,
  markupAppliesToInventory = false,
  hasPresets,
  onOpenPresets,
  onScanBarcode,
  aiEnabled,
  vehicleId,
  findings = [],
  onAddFinding,
  onEditFinding,
  openObservationsCount = 0,
  onShowExistingObservations,
}: DetailsLeftColumnProps) {
  // Which concerns somebody has actually looked at. Counted here rather than
  // queried, because the findings are already loaded for the section below.
  const answeredCounts = findings.reduce<Record<string, number>>((counts, finding) => {
    if (finding.concernId) counts[finding.concernId] = (counts[finding.concernId] ?? 0) + 1
    return counts
  }, {})

  const concerns = (
    <ConcernsSection
      concerns={formState.concerns}
      setConcerns={formState.setConcerns}
      onChange={formState.markDirty}
      answeredCounts={answeredCounts}
    />
  )

  // No set on this job yet. The tires that came off the car are standing in the
  // corner while the desk writes it up, so the offer to store them belongs here
  // rather than three screens away.
  const storeTires =
    !tireSet && tireHotelEnabled && record.vehicle ? (
      <StoreTiresButton
        serviceRecordId={record.id}
        vehicle={{
          id: record.vehicle.id,
          make: record.vehicle.make,
          model: record.vehicle.model,
          year: record.vehicle.year,
          licensePlate: record.vehicle.licensePlate ?? null,
          customerId: record.customer?.id ?? null,
        }}
        imperial={unitSystem === 'imperial'}
        thresholds={tireThresholds}
      />
    ) : null

  // Two short things, one line. Stacked, an empty concerns prompt and a lone
  // Store tires button read as two abandoned rows above the parts; side by
  // side they read as the toolbar they actually are. Once somebody types a
  // concern the block needs the full width, so it gets its own row back.
  const pairable = formState.concerns.length === 0

  return (
    <div className="space-y-3">
      {/* First thing on the job, above the work itself: why the car is here,
          in the customer's words. Above the parts, inside the working column:
          the tires are the first thing this job needs and the last thing the
          invoice sidebar cares about, so they belong here rather than spanning
          both columns. */}
      {pairable ? (
        <div className="flex items-center justify-between gap-2">
          {concerns}
          {storeTires}
        </div>
      ) : (
        <>
          {concerns}
          {storeTires && <div className="flex justify-end">{storeTires}</div>}
        </>
      )}

      {tireSet && (
        <TireSetBanner set={tireSet} serviceRecordId={record.id} thresholds={tireThresholds} />
      )}

      <PartsEditor
        partItems={formState.partItems}
        setPartItems={formState.dirtySetPartItems}
        updatePart={formState.updatePart}
        partsSubtotal={formState.partsSubtotal}
        currencyCode={currencyCode}
        hasInventory={inventoryParts.length > 0}
        inventoryParts={inventoryParts}
        onOpenInventory={() => formState.setShowInventoryPicker(true)}
        onScanBarcode={onScanBarcode}
        defaultMarkupPercent={defaultMarkupPercent}
        markupAppliesToInventory={markupAppliesToInventory}
      />
      <LaborEditor
        laborItems={formState.laborItems}
        setLaborItems={formState.dirtySetLaborItems}
        updateLabor={formState.updateLabor}
        laborSubtotal={formState.laborSubtotal}
        currencyCode={currencyCode}
        defaultLaborRate={defaultLaborRate}
        hasPresets={hasPresets}
        onOpenPresets={onOpenPresets}
        onAddFinding={onAddFinding}
        openObservationsCount={openObservationsCount}
        onShowExistingObservations={onShowExistingObservations}
      />
      <NotesSection
        initialData={formState.initialData}
        onNotesChange={formState.handleNotesChange}
        serviceRecordId={record.id}
        aiEnabled={aiEnabled}
      />
      {vehicleId && (
        <ServiceFindingsSection
          vehicleId={vehicleId}
          serviceRecordId={record.id}
          findings={findings}
          onAddFinding={onAddFinding}
          onEditFinding={onEditFinding}
        />
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PaymentsSection
          payments={record.payments || []}
          paymentStatus={formState.paymentStatus}
          manuallyPaid={record.manuallyPaid}
          totalPaid={formState.totalPaid}
          displayTotal={formState.displayTotal}
          balanceDue={formState.balanceDue}
          currencyCode={currencyCode}
          onCreatePayment={actions.handleCreatePayment}
          onDeletePayment={actions.handleDeletePayment}
          onTogglePaid={actions.handleTogglePaid}
          paymentLoading={actions.paymentLoading}
          deletingPayment={actions.deletingPayment}
        />
        <InvoiceSummary
          hasPartItems={formState.partItems.length > 0}
          hasLaborItems={formState.laborItems.length > 0}
          partsSubtotal={formState.partsSubtotal}
          laborSubtotal={formState.laborSubtotal}
          subtotal={formState.subtotal}
          discountAmount={formState.discountAmount}
          discountType={formState.discountType === 'none' ? null : formState.discountType}
          discountValue={formState.discountValue}
          taxRate={formState.taxRate}
          taxAmount={formState.taxAmount}
          taxInclusive={formState.taxInclusive}
          displayTotal={formState.displayTotal}
          totalPaid={formState.totalPaid}
          balanceDue={formState.balanceDue}
          hasPayments={(record.payments?.length ?? 0) > 0}
          currencyCode={currencyCode}
        />
      </div>
    </div>
  )
}
