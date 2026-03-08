import { PartsEditor } from '../service-edit/PartsEditor'
import { LaborEditor } from '../service-edit/LaborEditor'
import { NotesSection } from '../service-edit/NotesSection'
import { PaymentsSection } from '../service-detail/PaymentsSection'
import { InvoiceSummary } from '../service-detail/InvoiceSummary'
import type { useServiceFormState } from './useServiceFormState'
import type { useServiceActions } from './useServiceActions'
import type { ServiceDetail } from '../service-detail/types'
import type { InventoryPartOption } from '../service-edit/form-types'

interface DetailsLeftColumnProps {
  formState: ReturnType<typeof useServiceFormState>
  actions: ReturnType<typeof useServiceActions>
  record: ServiceDetail
  currencyCode: string
  defaultLaborRate: number
  inventoryParts: InventoryPartOption[]
}

export function DetailsLeftColumn({
  formState,
  actions,
  record,
  currencyCode,
  defaultLaborRate,
  inventoryParts,
}: DetailsLeftColumnProps) {
  return (
    <div className="space-y-3">
      <PartsEditor
        partItems={formState.partItems}
        setPartItems={formState.dirtySetPartItems}
        updatePart={formState.updatePart}
        partsSubtotal={formState.partsSubtotal}
        currencyCode={currencyCode}
        hasInventory={inventoryParts.length > 0}
        onOpenInventory={() => formState.setShowInventoryPicker(true)}
      />
      <LaborEditor
        laborItems={formState.laborItems}
        setLaborItems={formState.dirtySetLaborItems}
        updateLabor={formState.updateLabor}
        laborSubtotal={formState.laborSubtotal}
        currencyCode={currencyCode}
        defaultLaborRate={defaultLaborRate}
      />
      <NotesSection initialData={formState.initialData} onNotesChange={formState.handleNotesChange} />
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
