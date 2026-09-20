import { useState, useCallback, useRef, useEffect } from 'react'
import { calculateTotals } from '@/lib/tax'
import { normalizeWarranty, type WarrantyFields } from '@/lib/warranty'
import { useDeferredCommit } from '@/hooks/use-deferred-commit'
import { lineTotal, repricePartRow } from '@/features/inventory/Lib/partPricing'
import { reconcileConcernRows } from '@/features/vehicles/Lib/concernStory'
import { addedLaborLines } from '@/features/vehicles/Lib/laborLines'
import type { ConcernRow } from '../service-edit/form-types'
import type { ServicePartInput, ServiceLaborInput, InitialData } from './service-page-types'
import type { ServiceDetail } from '../service-detail/types'

export function useServiceFormState({
  vehicleId,
  initialData,
  defaultTaxRate,
  currentUserName,
  record,
  locked = false,
}: {
  vehicleId: string | null
  initialData: InitialData
  defaultTaxRate: number
  currentUserName: string
  record: ServiceDetail
  /** A locked invoice refuses saves, so it must not queue one. */
  locked?: boolean
}) {
  // Form state
  const [loading, setLoading] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(vehicleId)

  const [techName] = useState(initialData.techName || currentUserName)
  const [type, setType] = useState(initialData.type || 'maintenance')
  const [status, setStatus] = useState(initialData.status || 'completed')
  const [concerns, setConcerns] = useState<ConcernRow[]>(initialData.concerns || [])
  const [partItems, setPartItems] = useState<ServicePartInput[]>(initialData.partItems || [])
  const { schedule: scheduleCommit, cancel: cancelCommit } = useDeferredCommit()
  const [laborItems, setLaborItems] = useState<ServiceLaborInput[]>(initialData.laborItems || [])
  const [taxRate, setTaxRate] = useState(initialData.taxRate ?? defaultTaxRate)
  const [taxInclusive] = useState<boolean>(initialData.taxInclusive ?? false)
  // The split the job was created with. Fixed for the job's life: the
  // server re-derives the amounts from it on every save.
  const [taxComponentDefinitions] = useState(initialData.taxComponents ?? null)
  const [discountType, setDiscountType] = useState<string>(initialData.discountType || 'none')
  const [discountValue, setDiscountValue] = useState(initialData.discountValue ?? 0)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  // One value, because the four move together: choosing "not included" clears
  // the months, and read through normalizeWarranty so a job saved before the
  // statement existed opens as the included warranty it was.
  const [warranty, setWarranty] = useState<WarrantyFields>(() => normalizeWarranty(initialData))

  // Autosave state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read through a ref so markDirty stays stable; it is a dependency of most
  // of the setters below and rebuilding them all on a lock change is churn.
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const isSavingRef = useRef(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashSaved = useCallback(() => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setShowSaved(true)
    savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000)
  }, [])

  const markDirty = useCallback(() => {
    // A locked invoice cannot be saved, so nothing may queue an autosave that
    // the server will only refuse five seconds later.
    if (lockedRef.current) return
    setHasUnsavedChanges(true)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      if (!isSavingRef.current && formRef.current) {
        formRef.current.requestSubmit()
      }
    }, 5000)
  }, [])

  // When the lock engages mid-session — the invoice was just sent, or an
  // admin re-locked it — any save already queued can only be refused, and
  // "Unsaved changes" would offer a save that can never complete (and keep
  // the beforeunload warning armed). Drop both: the lock has closed every
  // route those edits could take.
  // A save gives new concerns their ids and stamps who confirmed what; the
  // page is refreshed after it, and the rows here have to follow. Without
  // this a concern typed in this session went back without an id on the next
  // save, was taken for a new one, and the saved row was deleted with every
  // finding that pointed at it.
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  hasUnsavedChangesRef.current = hasUnsavedChanges
  const savedConcernsKey = JSON.stringify(initialData.concerns ?? [])
  useEffect(() => {
    const saved: ConcernRow[] = JSON.parse(savedConcernsKey)
    setConcerns((current) => reconcileConcernRows(current, saved, hasUnsavedChangesRef.current))
  }, [savedConcernsKey])

  /**
   * Lines of work this job gained from somewhere else while the page was
   * open: a technician billing their time from the app. The page hears about
   * it on the work board channel and refreshes, which brings the saved lines
   * back through `initialData`.
   *
   * With nothing being edited they simply appear. Mid-edit they are held here
   * instead, because this form saves labour by replacing every line: taking
   * the server's list would throw away what is being typed, and leaving the
   * technician's line out of the next save would throw away their work. So
   * the page offers them (see the banner on the work order) and the save adds
   * them whether or not the offer was taken.
   */
  const [laborAddedElsewhere, setLaborAddedElsewhere] = useState<ServiceLaborInput[]>([])
  const savedLaborKey = JSON.stringify(initialData.laborItems ?? [])
  const syncedLaborRef = useRef<ServiceLaborInput[]>(initialData.laborItems ?? [])
  useEffect(() => {
    const saved: ServiceLaborInput[] = JSON.parse(savedLaborKey)
    const previous = syncedLaborRef.current
    syncedLaborRef.current = saved
    if (!hasUnsavedChangesRef.current) {
      setLaborItems(saved)
      setLaborAddedElsewhere([])
      return
    }
    const added = addedLaborLines(previous, saved)
    if (added.length > 0) setLaborAddedElsewhere((current) => [...current, ...added])
  }, [savedLaborKey])

  useEffect(() => {
    if (!locked) return
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
    setHasUnsavedChanges(false)
  }, [locked])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
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
  // Internal-only: what the parts cost the workshop before markup. Shown in
  // the totals card for the mechanic, never on the PDF or share views.
  const partsCostSubtotal = partItems.reduce(
    (sum, p) => sum + (Number(p.unitCost) || 0) * (Number(p.quantity) || 0),
    0
  )
  const laborSubtotal = laborItems.reduce((sum, l) => sum + l.total, 0)
  const subtotal = partsSubtotal + laborSubtotal
  const discountAmount =
    discountType === 'percentage'
      ? subtotal * (discountValue / 100)
      : discountType === 'fixed'
        ? Math.min(discountValue, subtotal)
        : 0
  const {
    taxAmount,
    totalAmount,
    components: taxComponents,
  } = calculateTotals({
    subtotal,
    discountAmount,
    taxRate,
    taxInclusive,
    components: taxComponentDefinitions,
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
  const vehicleName = record.vehicle
    ? `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`
    : ''

  // Part/labor update helpers
  //
  // The three pricing fields (unitCost, markupPercent, unitPrice) are linked by:
  //   unitPrice = unitCost × (1 + markupPercent / 100)
  // Cost, markup and price stay consistent with each other; repricePartRow
  // owns which of them moves, and quote parts use the same rules.
  const updatePart = useCallback(
    (
      index: number,
      field: keyof ServicePartInput,
      value: string | number,
      options: { commit?: boolean } = {}
    ) => {
      // Any edit ends the wait on the previous one.
      cancelCommit()
      setPartItems((prev) => {
        const updated = [...prev]
        const part = { ...updated[index], [field]: value }

        if (field === 'unitCost' || field === 'markupPercent' || field === 'unitPrice') {
          const priced = repricePartRow(part, field, options)
          part.unitPrice = priced.unitPrice
          part.markupPercent = priced.markupPercent
          part.priceOverridden = priced.priceOverridden
        }

        if (
          field === 'quantity' ||
          field === 'unitPrice' ||
          field === 'unitCost' ||
          field === 'markupPercent'
        ) {
          part.total = lineTotal(part.quantity, part.unitPrice)
        }
        updated[index] = part
        return updated
      })

      // A cost typed under a hand-set price restates the margin once typing
      // stops, so it lands on its own without needing the field to be left.
      if (field === 'unitCost' && !options.commit) {
        scheduleCommit(() =>
          setPartItems((prev) => {
            const row = prev[index]
            if (!row?.priceOverridden) return prev
            const updated = [...prev]
            updated[index] = { ...row, ...repricePartRow(row, 'unitCost', { commit: true }) }
            return updated
          })
        )
      }

      markDirty()
    },
    [markDirty, cancelCommit, scheduleCommit]
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
  const dirtySetPartItems: typeof setPartItems = useCallback(
    (action) => {
      setPartItems(action)
      markDirty()
    },
    [markDirty]
  )

  const dirtySetLaborItems: typeof setLaborItems = useCallback(
    (action) => {
      setLaborItems(action)
      markDirty()
    },
    [markDirty]
  )

  const applyLaborAddedElsewhere = useCallback(() => {
    if (laborAddedElsewhere.length === 0) return
    dirtySetLaborItems((prev) => [...prev, ...laborAddedElsewhere])
    setLaborAddedElsewhere([])
  }, [laborAddedElsewhere, dirtySetLaborItems])

  const clearLaborAddedElsewhere = useCallback(() => setLaborAddedElsewhere([]), [])

  /**
   * What a save has to write: the list on screen plus anything added
   * elsewhere that has not been shown yet. A save replaces every labour line
   * of the job, so a line left out of this is a line deleted.
   */
  const laborItemsForSave = [...laborItems, ...laborAddedElsewhere]

  const dirtySetDiscountType = useCallback(
    (v: string) => {
      setDiscountType(v)
      markDirty()
    },
    [markDirty]
  )
  const dirtySetDiscountValue = useCallback(
    (v: number) => {
      setDiscountValue(v)
      markDirty()
    },
    [markDirty]
  )
  const dirtySetTaxRate = useCallback(
    (v: number) => {
      setTaxRate(v)
      markDirty()
    },
    [markDirty]
  )
  const dirtySetType = useCallback(
    (v: string) => {
      setType(v)
      markDirty()
    },
    [markDirty]
  )
  const dirtySetStatus = useCallback(
    (v: string) => {
      setStatus(v)
      markDirty()
    },
    [markDirty]
  )
  const dirtySetSelectedVehicleId = useCallback(
    (v: string) => {
      setSelectedVehicleId(v)
      markDirty()
    },
    [markDirty]
  )
  const dirtySetWarranty = useCallback(
    (next: WarrantyFields) => {
      setWarranty(next)
      markDirty()
    },
    [markDirty]
  )

  return {
    // State
    loading,
    setLoading,
    selectedVehicleId,
    techName,
    type,
    status,
    concerns,
    setConcerns,
    partItems,
    laborItems,
    taxRate,
    taxInclusive,
    taxComponents,
    discountType,
    discountValue,
    showInventoryPicker,
    setShowInventoryPicker,
    showBarcodeScanner,
    setShowBarcodeScanner,
    showPresetPicker,
    setShowPresetPicker,
    // Autosave
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showSaved,
    formRef,
    autosaveTimer,
    isSavingRef,
    flashSaved,
    markDirty,
    saveNow,
    // Notes
    notesRef,
    handleNotesChange,
    // Custom fields
    customFieldsSaveRef,
    onCustomFieldsReady,
    // Computed
    partsSubtotal,
    partsCostSubtotal,
    laborSubtotal,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    displayTotal,
    totalPaid,
    balanceDue,
    paymentStatus,
    setLocalManuallyPaid,
    imageAttachments,
    vehicleName,
    // Helpers
    updatePart,
    updateLabor,
    dirtySetPartItems,
    dirtySetLaborItems,
    /** Lines added elsewhere that this page has not shown in the list yet. */
    laborAddedElsewhere,
    /** Put them in the list, where they are edited and saved like any other. */
    applyLaborAddedElsewhere,
    /** The list a save must write: what is on screen, plus those. */
    laborItemsForSave,
    /** After a save has written them: they are ordinary saved lines now. */
    clearLaborAddedElsewhere,
    dirtySetDiscountType,
    dirtySetDiscountValue,
    dirtySetTaxRate,
    dirtySetType,
    dirtySetStatus,
    /**
     * Sets the status without marking the form dirty. For a status that has
     * already been persisted by updateServiceStatus: dirtying it there would
     * show "Unsaved changes" for a change that is already saved, and the save
     * it invites is refused if the invoice has since locked.
     */
    setStatus,
    dirtySetSelectedVehicleId,
    // Warranty
    warranty,
    dirtySetWarranty,
    initialData,
  }
}
