'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { updateServiceRecord } from '@/features/vehicles/Actions/serviceActions'
import type { ServicePartInput, ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import { ServiceDetailContent } from '../service-detail/ServiceDetailContent'
import { BasicInfoSection } from './BasicInfoSection'
import { PartsEditor } from './PartsEditor'
import { LaborEditor } from './LaborEditor'
import { TotalsSection } from './TotalsSection'
import { NotesSection } from './NotesSection'
import { InventoryPickerDialog } from './InventoryPickerDialog'
import type { ServiceRecordFormProps } from './form-types'

export function ServiceRecordForm({
  vehicleId,
  vehicleName,
  defaultTaxRate = 0,
  taxEnabled = true,
  defaultLaborRate = 0,
  currencyCode = 'USD',
  initialData,
  inventoryParts = [],
  vehicles = [],
  teamMembers = [],
  currentUserName = '',
}: ServiceRecordFormProps) {
  const router = useRouter()
  const modal = useGlassModal()
  const [loading, setLoading] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleId)
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [techName, setTechName] = useState(initialData.techName || currentUserName)
  const [techOpen, setTechOpen] = useState(false)
  const [type, setType] = useState(initialData.type || 'maintenance')
  const [status, setStatus] = useState(initialData.status || 'completed')
  const [partItems, setPartItems] = useState<ServicePartInput[]>(initialData.partItems || [])
  const [laborItems, setLaborItems] = useState<ServiceLaborInput[]>(initialData.laborItems || [])
  const [taxRate, setTaxRate] = useState(initialData.taxRate ?? defaultTaxRate)
  const [discountType, setDiscountType] = useState<string>(initialData.discountType || 'none')
  const [discountValue, setDiscountValue] = useState(initialData.discountValue ?? 0)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false)
  const notesRef = useRef({
    invoiceNotes: initialData.invoiceNotes || '',
    diagnosticNotes: initialData.diagnosticNotes || '',
    description: initialData.description || '',
  })

  const handleNotesChange = useCallback(
    (field: 'invoiceNotes' | 'diagnosticNotes' | 'description', value: string) => {
      notesRef.current[field] = value
    },
    []
  )

  const partsSubtotal = partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotal = laborItems.reduce((sum, l) => sum + l.total, 0)
  const subtotal = partsSubtotal + laborSubtotal
  const discountAmount =
    discountType === 'percentage'
      ? subtotal * (discountValue / 100)
      : discountType === 'fixed'
        ? Math.min(discountValue, subtotal)
        : 0
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100)
  const totalAmount = subtotal - discountAmount + taxAmount

  const updatePart = useCallback(
    (index: number, field: keyof ServicePartInput, value: string | number) => {
      setPartItems((prev) => {
        const updated = [...prev]
        const part = { ...updated[index], [field]: value }
        if (field === 'quantity' || field === 'unitPrice') {
          part.total = Number(part.quantity) * Number(part.unitPrice)
        }
        updated[index] = part
        return updated
      })
    },
    []
  )

  const updateLabor = useCallback(
    (index: number, field: keyof ServiceLaborInput, value: string | number) => {
      setLaborItems((prev) => {
        const updated = [...prev]
        const labor = { ...updated[index], [field]: value }
        if (field === 'hours' || field === 'rate') {
          labor.total = Number(labor.hours) * Number(labor.rate)
        }
        updated[index] = labor
        return updated
      })
    },
    []
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const payload = {
      id: initialData.id,
      vehicleId: selectedVehicleId,
      title: formData.get('title') as string,
      description: notesRef.current.description || undefined,
      type,
      status,
      cost: totalAmount,
      mileage: Number(formData.get('mileage')) || undefined,
      serviceDate: (formData.get('serviceDate') as string) || new Date().toISOString(),
      techName: techName || undefined,
      diagnosticNotes: notesRef.current.diagnosticNotes || undefined,
      invoiceNotes: notesRef.current.invoiceNotes || undefined,
      invoiceNumber: (formData.get('invoiceNumber') as string) || undefined,
      partItems: partItems.filter((p) => p.name),
      laborItems: laborItems.filter((l) => l.description),
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      discountType: discountType === 'none' ? undefined : discountType,
      discountValue,
      discountAmount,
    }

    const result = await updateServiceRecord(payload)

    if (result.success) {
      toast.success('Service record updated')
      if (selectedVehicleId !== vehicleId) {
        router.push(`/vehicles/${selectedVehicleId}/service/${initialData.id}`)
      } else {
        router.refresh()
      }
    } else {
      modal.open('error', 'Error', result.error || 'Failed to update service record')
    }

    setLoading(false)
  }

  const leftColumn = (
    <div className="space-y-3">
      <PartsEditor
        partItems={partItems}
        setPartItems={setPartItems}
        updatePart={updatePart}
        partsSubtotal={partsSubtotal}
        currencyCode={currencyCode}
        hasInventory={inventoryParts.length > 0}
        onOpenInventory={() => setShowInventoryPicker(true)}
      />
      <LaborEditor
        laborItems={laborItems}
        setLaborItems={setLaborItems}
        updateLabor={updateLabor}
        laborSubtotal={laborSubtotal}
        currencyCode={currencyCode}
        defaultLaborRate={defaultLaborRate}
      />
      <NotesSection initialData={initialData} onNotesChange={handleNotesChange} />
    </div>
  )

  const rightColumn = (
    <div className="space-y-3">
      <BasicInfoSection
        initialData={initialData}
        vehicleId={vehicleId}
        vehicleName={vehicleName}
        selectedVehicleId={selectedVehicleId}
        setSelectedVehicleId={setSelectedVehicleId}
        vehicles={vehicles}
        vehicleOpen={vehicleOpen}
        setVehicleOpen={setVehicleOpen}
        type={type}
        setType={setType}
        status={status}
        setStatus={setStatus}
        techName={techName}
        setTechName={setTechName}
        techOpen={techOpen}
        setTechOpen={setTechOpen}
        teamMembers={teamMembers}
      />
      <TotalsSection
        partsSubtotal={partsSubtotal}
        laborSubtotal={laborSubtotal}
        subtotal={subtotal}
        discountType={discountType}
        setDiscountType={setDiscountType}
        discountValue={discountValue}
        setDiscountValue={setDiscountValue}
        discountAmount={discountAmount}
        taxEnabled={taxEnabled}
        taxRate={taxRate}
        setTaxRate={setTaxRate}
        taxAmount={taxAmount}
        totalAmount={totalAmount}
        currencyCode={currencyCode}
      />
    </div>
  )

  return (
    <>
      <form id="service-record-form" onSubmit={handleSubmit} className="flex h-full flex-col">
        <ServiceDetailContent leftColumn={leftColumn} rightColumn={rightColumn} />
      </form>

      <InventoryPickerDialog
        open={showInventoryPicker}
        onOpenChange={setShowInventoryPicker}
        inventoryParts={inventoryParts}
        currencyCode={currencyCode}
        onSelectPart={(part) => setPartItems((prev) => [...prev, part])}
      />
    </>
  )
}
