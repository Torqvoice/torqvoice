import { useState, useCallback, useRef, useEffect } from 'react'
import { calculateTotals } from '@/lib/tax'
import type { ServicePartInput, ServiceLaborInput, InitialData } from './service-page-types'
import type { ServiceDetail } from '../service-detail/types'

export function useServiceFormState({
  vehicleId,
  initialData,
  defaultTaxRate,
  currentUserName,
  record,
}: {
  vehicleId: string
  initialData: InitialData
  defaultTaxRate: number
  currentUserName: string
  record: ServiceDetail
}) {
  // Form state
  const [loading, setLoading] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleId)

  const [techName] = useState(initialData.techName || currentUserName)
  const [type, setType] = useState(initialData.type || 'maintenance')
  const [status, setStatus] = useState(initialData.status || 'completed')
  const [partItems, setPartItems] = useState<ServicePartInput[]>(initialData.partItems || [])
  const [laborItems, setLaborItems] = useState<ServiceLaborInput[]>(initialData.laborItems || [])
  const [taxRate, setTaxRate] = useState(initialData.taxRate ?? defaultTaxRate)
  const [taxInclusive] = useState<boolean>(initialData.taxInclusive ?? false)
  const [discountType, setDiscountType] = useState<string>(initialData.discountType || 'none')
  const [discountValue, setDiscountValue] = useState(initialData.discountValue ?? 0)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const [warrantyMonths, setWarrantyMonths] = useState<number | null>(initialData.warrantyMonths ?? null)
  const [warrantyMileage, setWarrantyMileage] = useState<number | null>(initialData.warrantyMileage ?? null)
  const [warrantyNotes, setWarrantyNotes] = useState<string | null>(initialData.warrantyNotes ?? null)

  // Autosave state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashSaved = useCallback(() => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setShowSaved(true)
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000)
  }, [])

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      if (!isSavingRef.current && formRef.current) {
        formRef.current.requestSubmit()
      }
    }, 5000)
  }, [])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const saveNow = async () => {
    if (!formRef.current || isSavingRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    formRef.current.requestSubmit()
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!isSavingRef.current) return resolve()
        setTimeout(check, 50)
      }
      setTimeout(check, 50)
    })
  }

  // Custom fields save callback ref
  const customFieldsSaveRef = useRef<(() => Promise<{ valid: boolean }>) | null>(null)

  const onCustomFieldsReady = useCallback((save: () => Promise<{ valid: boolean }>) => {
    customFieldsSaveRef.current = save
  }, [])

  // Notes ref
  const notesRef = useRef({
    invoiceNotes: initialData.invoiceNotes || '',
    diagnosticNotes: initialData.diagnosticNotes || '',
    description: initialData.description || '',
  })

  const handleNotesChange = useCallback(
    (field: 'invoiceNotes' | 'diagnosticNotes' | 'description', value: string) => {
      notesRef.current[field] = value
      markDirty()
    },
    [markDirty]
  )

  // Computed totals
  const partsSubtotal = partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotal = laborItems.reduce((sum, l) => sum + l.total, 0)
  const subtotal = partsSubtotal + laborSubtotal
  const discountAmount =
    discountType === 'percentage'
      ? subtotal * (discountValue / 100)
      : discountType === 'fixed'
        ? Math.min(discountValue, subtotal)
        : 0
  const { taxAmount, totalAmount } = calculateTotals({
    subtotal,
    discountAmount,
    taxRate,
    taxInclusive,
  })

  const [localManuallyPaid, setLocalManuallyPaid] = useState(record.manuallyPaid)
  const displayTotal = totalAmount > 0 ? totalAmount : record.cost
  const paidFromPayments = record.payments?.reduce((sum, p) => sum + p.amount, 0) || 0
  const totalPaid = localManuallyPaid ? displayTotal : paidFromPayments
  const balanceDue = displayTotal - totalPaid
  const paymentStatus = localManuallyPaid
    ? 'paid'
    : totalPaid === 0
      ? 'unpaid'
      : balanceDue <= 0
        ? 'paid'
        : 'partial'
  const imageAttachments = record.attachments?.filter((a) => a.category === 'image') || []
  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`

  // Part/labor update helpers
  //
  // The three pricing fields (unitCost, markupPercent, unitPrice) are linked by:
  //   unitPrice = unitCost × (1 + markupPercent / 100)
  // The user can edit any one and the others auto-sync so the row stays
  // mathematically consistent — Markup % never lies about real margin.
  const updatePart = useCallback(
    (index: number, field: keyof ServicePartInput, value: string | number) => {
      setPartItems((prev) => {
        const updated = [...prev]
        const part = { ...updated[index], [field]: value }
        const cost = Number(part.unitCost) || 0

        if (field === 'unitCost' || field === 'markupPercent') {
          // Cost or markup changed → recompute the customer-facing price.
          const markup = Number(part.markupPercent) || 0
          part.unitPrice = Math.round(cost * (1 + markup / 100) * 100) / 100
        } else if (field === 'unitPrice') {
          // Price was edited directly → derive markup back from cost so the
          // displayed margin matches reality. If cost is 0 there's no
          // meaningful percentage; leave markup at 0 and treat price as a
          // free override.
          const price = Number(part.unitPrice) || 0
          if (cost > 0) {
            part.markupPercent = Math.round(((price / cost) - 1) * 1000) / 10
          } else {
            part.markupPercent = 0
          }
        }

        if (
          field === 'quantity' ||
          field === 'unitPrice' ||
          field === 'unitCost' ||
          field === 'markupPercent'
        ) {
          part.total = Number(part.quantity) * Number(part.unitPrice)
        }
        updated[index] = part
        return updated
      })
      markDirty()
    },
    [markDirty]
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
      markDirty()
    },
    [markDirty]
  )

  // Wrapped setters that trigger autosave
  const dirtySetPartItems: typeof setPartItems = useCallback((action) => {
    setPartItems(action)
    markDirty()
  }, [markDirty])

  const dirtySetLaborItems: typeof setLaborItems = useCallback((action) => {
    setLaborItems(action)
    markDirty()
  }, [markDirty])

  const dirtySetDiscountType = useCallback((v: string) => { setDiscountType(v); markDirty() }, [markDirty])
  const dirtySetDiscountValue = useCallback((v: number) => { setDiscountValue(v); markDirty() }, [markDirty])
  const dirtySetTaxRate = useCallback((v: number) => { setTaxRate(v); markDirty() }, [markDirty])
  const dirtySetType = useCallback((v: string) => { setType(v); markDirty() }, [markDirty])
  const dirtySetStatus = useCallback((v: string) => { setStatus(v); markDirty() }, [markDirty])
  const dirtySetSelectedVehicleId = useCallback((v: string) => { setSelectedVehicleId(v); markDirty() }, [markDirty])
  const dirtySetWarrantyMonths = useCallback((v: number | null) => { setWarrantyMonths(v); markDirty() }, [markDirty])
  const dirtySetWarrantyMileage = useCallback((v: number | null) => { setWarrantyMileage(v); markDirty() }, [markDirty])
  const dirtySetWarrantyNotes = useCallback((v: string | null) => { setWarrantyNotes(v); markDirty() }, [markDirty])

  return {
    // State
    loading, setLoading,
    selectedVehicleId,
    techName, type, status,
    partItems, laborItems,
    taxRate, taxInclusive, discountType, discountValue,
    showInventoryPicker, setShowInventoryPicker,
    showBarcodeScanner, setShowBarcodeScanner,
    showPresetPicker, setShowPresetPicker,
    // Autosave
    hasUnsavedChanges, setHasUnsavedChanges, showSaved,
    formRef, autosaveTimer, isSavingRef,
    flashSaved, markDirty, saveNow,
    // Notes
    notesRef, handleNotesChange,
    // Custom fields
    customFieldsSaveRef, onCustomFieldsReady,
    // Computed
    partsSubtotal, laborSubtotal, subtotal,
    discountAmount, taxAmount, totalAmount,
    displayTotal, totalPaid, balanceDue, paymentStatus, setLocalManuallyPaid,
    imageAttachments, vehicleName,
    // Helpers
    updatePart, updateLabor,
    dirtySetPartItems, dirtySetLaborItems,
    dirtySetDiscountType, dirtySetDiscountValue, dirtySetTaxRate,
    dirtySetType, dirtySetStatus, dirtySetSelectedVehicleId,
    // Warranty
    warrantyMonths, warrantyMileage, warrantyNotes,
    dirtySetWarrantyMonths, dirtySetWarrantyMileage, dirtySetWarrantyNotes,
    initialData,
  }
}
