'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PartsEditor } from '../service-edit/PartsEditor'
import { LaborEditor } from '../service-edit/LaborEditor'
import { NotesSection } from '../service-edit/NotesSection'
import { PaymentsSection } from '../service-detail/PaymentsSection'
import { InvoiceSummary } from '../service-detail/InvoiceSummary'
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
  // Only show observations from OTHER work orders in the banner
  const otherObservations = openObservations.filter((o) => o.serviceRecordId !== record.id)
  const [selectedObs, setSelectedObs] = useState<Set<string>>(() => new Set(otherObservations.map((o) => o.id)))

  const dismissKey = `obs-dismissed-${record.id}`
  const [dismissState, setDismissState] = useState<'loading' | 'show' | 'hidden'>('loading')
  useEffect(() => {
    try {
      setDismissState(sessionStorage.getItem(dismissKey) === '1' ? 'hidden' : 'show')
    } catch {
      setDismissState('show')
    }
  }, [dismissKey])
  const setDismissed = (v: boolean) => {
    setDismissState(v ? 'hidden' : 'show')
    try { if (v) sessionStorage.setItem(dismissKey, '1'); else sessionStorage.removeItem(dismissKey) } catch {}
  }

  const showBanner = otherObservations.length > 0 && dismissState === 'show'

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
      {showBanner && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-sm font-medium">{tf('vehicleHasObservations', { count: otherObservations.length })}</p>
            </div>
            <button type="button" onClick={() => setDismissed(true)} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {otherObservations.map((o) => (
              <label key={o.id} className="flex items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30 cursor-pointer">
                <Checkbox
                  checked={selectedObs.has(o.id)}
                  onCheckedChange={() => toggleObs(o.id)}
                  className="mt-0.5"
                />
                <span>{o.description}{o.notes ? <span className="text-muted-foreground"> — {o.notes}</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={selectedObs.size === 0 || addingObservations} onClick={() => onAddObservations?.(Array.from(selectedObs))}>
              {addingObservations ? <span className="mr-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
              {tf('addToWorkOrder', { count: selectedObs.size })}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              {tf('dismiss')}
            </Button>
          </div>
        </div>
      )}
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
        onAddFinding={() => setOpenFindingForm(true)}
        openObservationsCount={otherObservations.length}
        onShowExistingObservations={() => setDismissed(false)}
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
        externalOpenForm={openFindingForm}
        onExternalOpenFormHandled={() => setOpenFindingForm(false)}
      />
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
