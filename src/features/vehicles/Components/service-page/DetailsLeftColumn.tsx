'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PartsEditor } from '../service-edit/PartsEditor'
import { LaborEditor } from '../service-edit/LaborEditor'
import { NotesSection } from '../service-edit/NotesSection'
import { PaymentsSection } from '../service-detail/PaymentsSection'
import { InvoiceSummary } from '../service-detail/InvoiceSummary'
import { FindingForm } from '../FindingForm'
import { ServiceFindingsSection } from '../service-detail/ServiceFindingsSection'
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
  hasPresets?: boolean
  onOpenPresets?: () => void
  onScanBarcode?: () => void
  aiEnabled?: boolean
  vehicleId: string
  findings?: { id: string; description: string; severity: string; status: string; notes: string | null }[]
  openObservations?: { id: string; description: string; severity: string; notes: string | null; serviceRecordId: string | null }[]
  onAddObservations?: (selectedIds: string[]) => Promise<void>
  addingObservations?: boolean
}

export function DetailsLeftColumn({
  formState,
  actions,
  record,
  currencyCode,
  defaultLaborRate,
  inventoryParts,
  hasPresets,
  onOpenPresets,
  onScanBarcode,
  aiEnabled,
  vehicleId,
  findings = [],
  openObservations = [],
  onAddObservations,
  addingObservations = false,
}: DetailsLeftColumnProps) {
  const tf = useTranslations('vehicles.findings')
  const [openFindingForm, setOpenFindingForm] = useState(false)
  const [editingFinding, setEditingFinding] = useState<{ id: string; description: string; severity: string; status: string; notes: string | null } | undefined>()
  const [showExistingDialog, setShowExistingDialog] = useState(false)

  const otherObservations = openObservations.filter((o) => o.serviceRecordId !== record.id)
  const [selectedObs, setSelectedObs] = useState<Set<string>>(() => new Set(otherObservations.map((o) => o.id)))

  const toggleObs = (id: string) => {
    setSelectedObs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
        onScanBarcode={onScanBarcode}
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
        onAddFinding={() => { setEditingFinding(undefined); setOpenFindingForm(true) }}
        openObservationsCount={otherObservations.length}
        onShowExistingObservations={() => setShowExistingDialog(true)}
      />
      <NotesSection
        initialData={formState.initialData}
        onNotesChange={formState.handleNotesChange}
        serviceRecordId={record.id}
        aiEnabled={aiEnabled}
      />
      <ServiceFindingsSection
        vehicleId={vehicleId}
        serviceRecordId={record.id}
        findings={findings}
        onAddFinding={() => { setEditingFinding(undefined); setOpenFindingForm(true) }}
        onEditFinding={(f) => { setEditingFinding(f); setOpenFindingForm(true) }}
      />
      <FindingForm
        vehicleId={vehicleId}
        serviceRecordId={record.id}
        open={openFindingForm}
        onOpenChange={setOpenFindingForm}
        finding={editingFinding}
      />

      {/* Existing observations dialog */}
      <Dialog open={showExistingDialog} onOpenChange={setShowExistingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tf('vehicleHasObservations', { count: otherObservations.length })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {otherObservations.map((o) => (
              <label key={o.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selectedObs.has(o.id)}
                  onCheckedChange={() => toggleObs(o.id)}
                  className="mt-0.5"
                />
                <span>{o.description}{o.notes ? <span className="text-muted-foreground"> — {o.notes}</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowExistingDialog(false)}>
              {tf('dismiss')}
            </Button>
            <Button
              disabled={selectedObs.size === 0 || addingObservations}
              onClick={async () => {
                await onAddObservations?.(Array.from(selectedObs))
                setShowExistingDialog(false)
              }}
            >
              {addingObservations ? <span className="mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
              {tf('addToWorkOrder', { count: selectedObs.size })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
