import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { roundMoney } from '@/lib/money'
import { calculateTotals, discountAmountFor, storedTaxableSubtotal } from '@/lib/tax'
import {
  TAX_APPLIES_TO_ALL,
  type TaxApplies,
  type TaxableShare,
  taxableLaborTotal,
  taxablePartsTotal,
} from '@/lib/taxable-lines'
import { normalizeWarranty, type WarrantyFields } from '@/lib/warranty'
import { useDeferredCommit } from '@/hooks/use-deferred-commit'
import { useSaveBeforeLeaving } from '@/hooks/use-save-before-leaving'
import { lineTotal, repricePartRow } from '@/features/inventory/Lib/partPricing'
import { reconcileConcernRows } from '@/features/vehicles/Lib/concernStory'
import { addedLaborLines, savedLaborShape } from '@/features/vehicles/Lib/laborLines'
import { addedPartLines, savedPartShape } from '@/features/vehicles/Lib/partLines'
import {
  concernsForSave,
  changedWorkOrderFields,
  discountForSave,
  mergeWorkOrderFields,
  richText,
  sameFieldValue,
  savedWorkOrderFields,
  warrantyForSave,
  type WorkOrderField,
  type WorkOrderFieldValues,
} from '@/features/vehicles/Lib/workOrderFields'
import {
  recalculateShopFeeLines,
  shopFeeLinesLast,
  type ShopFeeConfig,
} from '@/features/settings/Lib/shopFee'
import type { ConcernRow } from '../service-edit/form-types'
import type { ServicePartInput, ServiceLaborInput, InitialData } from './service-page-types'
import type { ServiceDetail } from '../service-detail/types'
import { vehicleName as vehicleNameOf } from '@/lib/vehicle-name'
import type { CustomFieldsSave } from '@/features/custom-fields/Components/CustomFieldsForm'

export function useServiceFormState({
  vehicleId,
  initialData,
  defaultTaxRate,
  currentUserName,
  record,
  locked = false,
  shopFee = null,
  taxApplies = TAX_APPLIES_TO_ALL,
}: {
  vehicleId: string | null
  initialData: InitialData
  defaultTaxRate: number
  currentUserName: string
  record: ServiceDetail
  /** The workshop's shop fee; a percentage one is re-priced as lines change. */
  shopFee?: ShopFeeConfig | null
  /** A locked invoice refuses saves, so it must not queue one. */
  locked?: boolean
  /** What a line that has not chosen is taxed as: the workshop's rule for its kind. */
  taxApplies?: TaxApplies
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
  // The same, readable from callbacks and the link handler without waiting
  // for a render.
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  hasUnsavedChangesRef.current = hasUnsavedChanges
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

  /**
   * Counts edits. A save notes the count it started from and clears the
   * unsaved flag only if nothing was edited while it ran (markSaved): a note
   * typed during an autosave used to read as saved, and a link waiting on that
   * autosave left without it.
   */
  const editRevisionRef = useRef(0)
  /**
   * True for the one save the autosave timer starts. The person is typing
   * somewhere on the page then, so a refusal is said without taking the
   * focus away from them; a save they asked for takes them to the field.
   */
  const autosaveRunRef = useRef(false)

  const markDirty = useCallback(() => {
    // A locked invoice cannot be saved, so nothing may queue an autosave that
    // the server will only refuse five seconds later.
    if (lockedRef.current) return
    editRevisionRef.current += 1
    hasUnsavedChangesRef.current = true
    setHasUnsavedChanges(true)
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      if (!isSavingRef.current && formRef.current) {
        autosaveRunRef.current = true
        formRef.current.requestSubmit()
      }
    }, 5000)
  }, [])

  /**
   * A save that started at `revision` went through. Edits made while it ran
   * keep the page unsaved and queue a save of their own.
   */
  const markSaved = useCallback(
    (revision: number) => {
      if (editRevisionRef.current === revision) {
        // The ref at once: a link waiting on this save reads it before the
        // page has rendered again.
        hasUnsavedChangesRef.current = false
        setHasUnsavedChanges(false)
        return
      }
      markDirty()
    },
    [markDirty]
  )

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
  const savedConcernsKey = JSON.stringify(initialData.concerns ?? [])
  // Set by the merge below when the concerns changed elsewhere and not here:
  // the server's list is taken then, whatever else is being edited.
  const adoptConcernsRef = useRef(false)
  useEffect(() => {
    const saved: ConcernRow[] = JSON.parse(savedConcernsKey)
    const keepRows = hasUnsavedChangesRef.current && !adoptConcernsRef.current
    adoptConcernsRef.current = false
    setConcerns((current) => reconcileConcernRows(current, saved, keepRows))
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
  /**
   * The lines of the save on its way to the server, if one is. A refresh can
   * be read either side of its write; see addedLaborLines.
   */
  const sendingLinesRef = useRef<{
    parts: ServicePartInput[]
    labor: ServiceLaborInput[]
  } | null>(null)

  /**
   * Whether this page has changed its parts, or its labour, since its last
   * save. A save sends a list only then (it replaces every line of it), and
   * only then does a list keep what is typed and hold lines from elsewhere
   * behind the banner: a page editing the notes takes the technician's new
   * line straight into its list, as a page editing nothing does. The
   * revision says whether a save covered every edit of the list.
   */
  const partsEditedRef = useRef(false)
  const laborEditedRef = useRef(false)
  const partsRevisionRef = useRef(0)
  const laborRevisionRef = useRef(0)
  const markPartsEdited = useCallback(() => {
    partsEditedRef.current = true
    partsRevisionRef.current += 1
  }, [])
  const markLaborEdited = useCallback(() => {
    laborEditedRef.current = true
    laborRevisionRef.current += 1
  }, [])

  const [laborAddedElsewhere, setLaborAddedElsewhere] = useState<ServiceLaborInput[]>([])
  const savedLaborKey = JSON.stringify(initialData.laborItems ?? [])
  const syncedLaborRef = useRef<ServiceLaborInput[]>(initialData.laborItems ?? [])
  useEffect(() => {
    const saved: ServiceLaborInput[] = JSON.parse(savedLaborKey)
    const previous = syncedLaborRef.current
    syncedLaborRef.current = saved
    if (!laborEditedRef.current) {
      setLaborItems(saved)
      setLaborAddedElsewhere([])
      return
    }
    const added = addedLaborLines(previous, saved, sendingLinesRef.current?.labor)
    if (added.length > 0) setLaborAddedElsewhere((current) => [...current, ...added])
  }, [savedLaborKey])

  // Parts the same way: a technician scanning a part onto the job from the
  // app. The list used to be read once when the page opened, so the part never
  // showed, and the desk's next save, which replaces every part line, deleted
  // it and put its stock back.
  const [partsAddedElsewhere, setPartsAddedElsewhere] = useState<ServicePartInput[]>([])
  const savedPartsKey = JSON.stringify(initialData.partItems ?? [])
  const syncedPartsRef = useRef<ServicePartInput[]>(initialData.partItems ?? [])
  useEffect(() => {
    const saved: ServicePartInput[] = JSON.parse(savedPartsKey)
    const previous = syncedPartsRef.current
    syncedPartsRef.current = saved
    if (!partsEditedRef.current) {
      setPartItems(saved)
      setPartsAddedElsewhere([])
      return
    }
    const added = addedPartLines(previous, saved, sendingLinesRef.current?.parts)
    if (added.length > 0) setPartsAddedElsewhere((current) => [...current, ...added])
  }, [savedPartsKey])

  // What is waiting behind the banner as of the last render. A save's answer
  // reads it: lines that arrived while the save ran are on the server too.
  const laborPendingRef = useRef(laborAddedElsewhere)
  const partsPendingRef = useRef(partsAddedElsewhere)
  useEffect(() => {
    laborPendingRef.current = laborAddedElsewhere
  }, [laborAddedElsewhere])
  useEffect(() => {
    partsPendingRef.current = partsAddedElsewhere
  }, [partsAddedElsewhere])

  /**
   * A save went through: the lines it sent are the server's now. The page can
   * be unsaved again when the refresh after it arrives (a reading held back
   * for its question, or a preset applied while the save ran). Without this
   * that refresh was compared with the lines from before the save, the line
   * just edited read as one added elsewhere, it showed twice, and the next
   * save sent it twice.
   *
   * Two things keep that comparison honest. The lines are kept as the server
   * returns them (savedLaborShape, savedPartShape), not as typed. And a line
   * a technician added while the save ran stays known: it is still waiting
   * behind the banner, and forgetting it here brought it back a second time
   * with the next refresh. Called from the save that was started in this
   * render, so the waiting lines that save sent are the first ones counted
   * here; the rest arrived after it (see commitLaborAddedElsewhere).
   */
  const laborSent = laborAddedElsewhere.length
  const partsSent = partsAddedElsewhere.length
  const acknowledgeSavedLines = useCallback(
    (lines: { parts: ServicePartInput[]; labor: ServiceLaborInput[] }) => {
      syncedPartsRef.current = [
        ...lines.parts.map(savedPartShape),
        ...partsPendingRef.current.slice(partsSent),
      ]
      syncedLaborRef.current = [
        ...lines.labor.map(savedLaborShape),
        ...laborPendingRef.current.slice(laborSent),
      ]
    },
    [laborSent, partsSent]
  )

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
      // Read live: "Leave without saving" drops the edits and goes in the
      // same moment, before this listener is taken down.
      if (!hasUnsavedChangesRef.current) return
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

  /**
   * Leaving the page by a link saves first (useSaveBeforeLeaving). A save the
   * rules refuse, such as a required custom field left empty, holds the link
   * and asks: stay and fix it, or leave without the unsaved changes.
   */
  /**
   * Why the last save was refused, written by the save itself. The link
   * guard reads it once the save has settled, and shows it in the dialog.
   */
  const lastSaveErrorRef = useRef<string | null>(null)
  /**
   * True while a link waits on its save. A refusal then goes into the leave
   * dialog rather than a toast or an error box on top of it.
   */
  const leavingRef = useRef(false)
  const { blockedLeave, stayOnPage, leaveWithoutSaving } = useSaveBeforeLeaving({
    active: hasUnsavedChanges,
    isDirty: () => hasUnsavedChangesRef.current,
    isSaving: () => isSavingRef.current,
    save: saveNow,
    lastErrorRef: lastSaveErrorRef,
    leavingRef,
    discard: () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
      }
      hasUnsavedChangesRef.current = false
      setHasUnsavedChanges(false)
    },
  })

  /**
   * The reading the person said yes to, when it was far above the last one
   * (readingNeedsAnswer). Until then the save holds the reading back and the
   * page stays unsaved; the ref is what a save started this instant reads.
   */
  const [confirmedReading, setConfirmedReading] = useState<number | null>(null)
  const confirmedReadingRef = useRef<number | null>(null)
  const confirmReading = useCallback(
    (value: number) => {
      confirmedReadingRef.current = value
      setConfirmedReading(value)
      // Saved now: the answer is the last thing the reading waited for.
      markDirty()
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      if (!isSavingRef.current && formRef.current) formRef.current.requestSubmit()
    },
    [markDirty]
  )

  // Custom fields save callback ref
  const customFieldsSaveRef = useRef<CustomFieldsSave | null>(null)

  const onCustomFieldsReady = useCallback((save: CustomFieldsSave) => {
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

  /**
   * The job's own fields as the server last told this page (workOrderFields).
   * A save sends the ones the page holds differently, and no others: with the
   * job open in a second tab, a field this one never touched is the other
   * tab's to change, and sending back this page's old copy of it threw away
   * what was saved there.
   */
  const serverFieldsKey = JSON.stringify(savedWorkOrderFields(initialData, defaultTaxRate))
  const syncedFieldsRef = useRef<WorkOrderFieldValues>(JSON.parse(serverFieldsKey))
  /** The fields this page has saved, so it can be told when a later save replaces one. */
  const savedHereRef = useRef(new Set<WorkOrderField>())
  /**
   * The values a save on its way to the server sent, as they were when it
   * left. A refresh can show that save before its answer arrives; the field
   * then compares against what was sent, not what is on screen, so an edit
   * made after the save left is still this page's (even one that puts the
   * field back as it was before).
   */
  const sendingFieldsRef = useRef<Partial<WorkOrderFieldValues> | null>(null)
  /**
   * Values taken from the server for fields drawn by sections that hold
   * their own copy (the notes editors, the invoice dates). A new object each
   * time, so a section follows even when the same value comes back.
   */
  const [adoptedFields, setAdoptedFields] = useState<
    Partial<Record<WorkOrderField, { value: unknown }>>
  >({})
  /**
   * Fields saved somewhere else that this page had changed too. `kept`: this
   * page is still editing it, and its save replaces the other one. `replaced`:
   * this page had saved it, and a later save elsewhere replaced that.
   */
  const [changedElsewhere, setChangedElsewhere] = useState<{
    kept: WorkOrderField[]
    replaced: WorkOrderField[]
  }>({ kept: [], replaced: [] })
  const dismissChangedElsewhere = useCallback(
    () => setChangedElsewhere({ kept: [], replaced: [] }),
    []
  )

  /**
   * The fields as the page holds them now. Most are state; the title, the
   * reading and the invoice number and dates are read from the form, and a
   * field the page does not draw is left out.
   */
  const readCurrentFields = (): Partial<WorkOrderFieldValues> => {
    const current: Partial<WorkOrderFieldValues> = {
      type,
      status,
      taxRate,
      discount: discountForSave(discountType, discountValue),
      warranty: warrantyForSave(warranty),
      concerns: concernsForSave(concerns),
      description: richText(notesRef.current.description),
      diagnosticNotes: richText(notesRef.current.diagnosticNotes),
      invoiceNotes: richText(notesRef.current.invoiceNotes),
    }
    const form = formRef.current
    const read = (name: string) =>
      form?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `input[name="${name}"], textarea[name="${name}"]`
      )?.value
    const title = read('title')
    if (title !== undefined) current.title = title
    const mileage = read('mileage')
    if (mileage !== undefined) {
      if (mileage.trim() === '') current.mileage = null
      else if (!Number.isNaN(Number(mileage))) current.mileage = Number(mileage)
    }
    for (const name of ['invoiceNumber', 'invoiceDate', 'invoiceDueDate'] as const) {
      const value = read(name)
      if (value !== undefined) current[name] = value
    }
    return current
  }
  const readCurrentFieldsRef = useRef(readCurrentFields)
  readCurrentFieldsRef.current = readCurrentFields

  /**
   * The job as the server has it now, after a save here or anywhere else:
   * each field this page has not changed takes the server's value, each one
   * it has keeps what is typed (mergeWorkOrderFields). Before the sections'
   * own effects run, so what they hold is still what this page had.
   */
  useLayoutEffect(() => {
    const server: WorkOrderFieldValues = JSON.parse(serverFieldsKey)
    // This page's own save, shown by the refresh before its answer is back:
    // what it sent is what this page last knew of those fields.
    let synced = syncedFieldsRef.current
    const sending = sendingFieldsRef.current
    if (sending) {
      for (const field of Object.keys(sending) as WorkOrderField[]) {
        if (!sameFieldValue(field, server[field], sending[field])) continue
        synced = { ...synced, [field]: sending[field] }
        delete sending[field]
        savedHereRef.current.add(field)
      }
    }
    const merged = mergeWorkOrderFields({
      synced,
      current: readCurrentFieldsRef.current(),
      server,
      savedHere: savedHereRef.current,
    })
    const { adopt, replaced } = merged
    let { kept } = merged
    // A cancelled invoice is final, and no save can change it back, so the
    // cancel is taken whatever stage this page had picked.
    if (server.status === 'cancelled' && kept.includes('status')) {
      kept = kept.filter((field) => field !== 'status')
      adopt.push('status')
    }
    syncedFieldsRef.current = server
    for (const field of replaced) savedHereRef.current.delete(field)
    const setInput = (name: string, value: string) => {
      const input = formRef.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`)
      if (input) input.value = value
    }
    for (const field of adopt) {
      if (field === 'type') setType(server.type)
      else if (field === 'status') setStatus(server.status)
      else if (field === 'taxRate') setTaxRate(server.taxRate)
      else if (field === 'discount') {
        setDiscountType(server.discount.discountType)
        setDiscountValue(server.discount.discountValue)
      } else if (field === 'warranty') setWarranty(normalizeWarranty(server.warranty))
      else if (field === 'concerns') adoptConcernsRef.current = true
      else if (field === 'mileage') setInput('mileage', String(server.mileage ?? ''))
      else if (field === 'invoiceNumber') setInput('invoiceNumber', server.invoiceNumber)
      else if (field === 'description' || field === 'diagnosticNotes' || field === 'invoiceNotes') {
        notesRef.current[field] = server[field]
      }
    }
    if (adopt.length > 0) {
      setAdoptedFields((previous) => {
        const next = { ...previous }
        for (const field of adopt) next[field] = { value: server[field] }
        return next
      })
    }
    if (kept.length > 0 || replaced.length > 0) {
      const union = (a: WorkOrderField[], b: WorkOrderField[]) => [...new Set([...a, ...b])]
      setChangedElsewhere((previous) => ({
        kept: union(previous.kept, kept),
        replaced: union(previous.replaced, replaced),
      }))
    }
  }, [serverFieldsKey])

  /**
   * What a save sends of the job's own fields: those this page changed,
   * as the page holds them.
   */
  const fieldChanges = useCallback(() => {
    const current = readCurrentFieldsRef.current()
    return { current, changed: changedWorkOrderFields(syncedFieldsRef.current, current) }
  }, [])

  /** A save leaves with these values (see sendingFieldsRef); null when it is over. */
  const beginFieldSave = useCallback((sent: Partial<WorkOrderFieldValues> | null) => {
    sendingFieldsRef.current = sent ? { ...sent } : null
  }, [])

  /** A save went through: these values are the server's now, and this page's. */
  const acknowledgeSavedFields = useCallback((sent: Partial<WorkOrderFieldValues>) => {
    const fields = Object.keys(sent) as WorkOrderField[]
    // A field a refresh already showed this save for is settled there, and
    // may have moved on since; only the rest are taken as sent.
    const sending = sendingFieldsRef.current
    if (fields.length === 0) return
    const unseen = sending
      ? Object.fromEntries(fields.filter((f) => f in sending).map((f) => [f, sent[f]]))
      : sent
    syncedFieldsRef.current = { ...syncedFieldsRef.current, ...unseen }
    for (const field of fields) savedHereRef.current.add(field)
    setChangedElsewhere((previous) => {
      const kept = previous.kept.filter((field) => !fields.includes(field))
      const replaced = previous.replaced.filter((field) => !fields.includes(field))
      return kept.length === previous.kept.length && replaced.length === previous.replaced.length
        ? previous
        : { kept, replaced }
    })
  }, [])

  /**
   * Which lists a save is about to send, and the edits it covers; handed back
   * to settleLineEdits once it went through.
   */
  const lineEditsForSave = useCallback(
    (pending: { parts: number; labor: number }) => ({
      parts: partsEditedRef.current || pending.parts > 0,
      labor: laborEditedRef.current || pending.labor > 0,
      partsRevision: partsRevisionRef.current,
      laborRevision: laborRevisionRef.current,
    }),
    []
  )
  /** The lists a save wrote are the server's again, unless edited while it ran. */
  const settleLineEdits = useCallback((sent: ReturnType<typeof lineEditsForSave>) => {
    if (sent.parts && partsRevisionRef.current === sent.partsRevision) {
      partsEditedRef.current = false
    }
    if (sent.labor && laborRevisionRef.current === sent.laborRevision) {
      laborEditedRef.current = false
    }
  }, [])

  /**
   * What a save has to write: the lists on screen plus anything added
   * elsewhere that has not been shown yet. A save replaces every part and
   * labour line of the job, so a line left out of these is a line deleted.
   * The shop fee goes last, under the work it is charged on.
   */
  const partItemsForSave = [...partItems, ...partsAddedElsewhere]
  const laborItemsForSave = shopFeeLinesLast([...laborItems, ...laborAddedElsewhere])

  // Computed totals. They count the lines waiting behind the banner too: those
  // are on the job already, and a save sends them, so the money it sends has
  // to include them or the invoice is saved short.
  //
  // Each line to the cent first, as the save stores it (serviceSchema): the
  // page's own sum of unrounded lines (2 x 2.5 h at 19.99 is 99.95) is not
  // what the stored lines add up to (2 x 49.98), and the invoice would not
  // add up.
  const partLinesForTotals = partItemsForSave.map((p) => ({ ...p, total: roundMoney(p.total) }))
  const laborLinesForTotals = laborItemsForSave.map((l) => ({ ...l, total: roundMoney(l.total) }))
  const partsSubtotal = roundMoney(partLinesForTotals.reduce((sum, p) => sum + p.total, 0))

  // A percentage shop fee follows the lines it is a percentage of. Returns the
  // same array when the fee is already right, so this settles after one pass.
  // A fee that did move is a change to save: the workshop's percentage may
  // have changed since the job was last saved, and the PDF prints the saved
  // figure, so the screen must not show one fee and the invoice another.
  useEffect(() => {
    if (locked) return
    const next = recalculateShopFeeLines(laborItems, partsSubtotal, shopFee)
    if (next === laborItems) return
    setLaborItems(next)
    markLaborEdited()
    markDirty()
  }, [laborItems, partsSubtotal, shopFee, locked, markDirty, markLaborEdited])

  // Internal-only: what the parts cost the workshop before markup. Shown in
  // the totals card for the mechanic, never on the PDF or share views.
  const partsCostSubtotal = partItemsForSave.reduce(
    (sum, p) => sum + (Number(p.unitCost) || 0) * (Number(p.quantity) || 0),
    0
  )
  const laborSubtotal = roundMoney(laborLinesForTotals.reduce((sum, l) => sum + l.total, 0))
  const subtotal = roundMoney(partsSubtotal + laborSubtotal)
  const discountAmount = discountAmountFor(subtotal, discountType, discountValue)
  // The tax is charged on the taxable lines alone. A line says whether it
  // is taxed, and one that has not been asked follows the workshop's rule
  // for its kind; the server settles it the same way when the job is saved.
  const taxableParts = taxablePartsTotal(partLinesForTotals, taxApplies)
  const taxableLabor = taxableLaborTotal(laborLinesForTotals, taxApplies)
  const taxableSubtotal = storedTaxableSubtotal(subtotal, taxableParts + taxableLabor)
  const {
    taxAmount,
    totalAmount,
    components: taxComponents,
    taxableAmount,
  } = calculateTotals({
    subtotal,
    discountAmount,
    taxRate,
    taxInclusive,
    components: taxComponentDefinitions,
    taxableSubtotal,
  })
  /**
   * How much of each figure is taxed, for the totals card; null while every
   * line is taxed, which leaves the card showing what it always has.
   */
  const taxableShare: TaxableShare | null =
    taxableSubtotal === null
      ? null
      : { parts: taxableParts, labor: taxableLabor, subtotal: taxableSubtotal, taxableAmount }

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
  const vehicleName = record.vehicle ? `${vehicleNameOf(record.vehicle)}` : ''

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

      markPartsEdited()
      markDirty()
    },
    [markDirty, markPartsEdited, cancelCommit, scheduleCommit]
  )

  const updateLabor = useCallback(
    (index: number, field: keyof ServiceLaborInput, value: string | number) => {
      setLaborItems((prev) => {
        const updated = [...prev]
        const labor = { ...updated[index], [field]: value }
        if (field === 'hours' || field === 'rate') {
          labor.total = roundMoney(Number(labor.hours) * Number(labor.rate))
        }
        updated[index] = labor
        return updated
      })
      markLaborEdited()
      markDirty()
    },
    [markDirty, markLaborEdited]
  )

  // Wrapped setters that trigger autosave
  const dirtySetPartItems: typeof setPartItems = useCallback(
    (action) => {
      setPartItems(action)
      markPartsEdited()
      markDirty()
    },
    [markDirty, markPartsEdited]
  )

  const dirtySetLaborItems: typeof setLaborItems = useCallback(
    (action) => {
      setLaborItems(action)
      markLaborEdited()
      markDirty()
    },
    [markDirty, markLaborEdited]
  )

  const applyLaborAddedElsewhere = useCallback(() => {
    if (laborAddedElsewhere.length === 0) return
    dirtySetLaborItems((prev) => [...prev, ...laborAddedElsewhere])
    setLaborAddedElsewhere([])
  }, [laborAddedElsewhere, dirtySetLaborItems])

  /**
   * After a save has written them: they are ordinary saved lines now, so they
   * go into the list. Dropping them instead lost them, because the re-read
   * that follows a save can read exactly as it did before and so never brings
   * them back, and the next save then deleted them. Only the lines that save
   * sent are moved; one that arrived while it ran keeps waiting.
   */
  const commitLaborAddedElsewhere = useCallback(() => {
    if (laborAddedElsewhere.length === 0) return
    setLaborItems((prev) => shopFeeLinesLast([...prev, ...laborAddedElsewhere]))
    setLaborAddedElsewhere((current) => current.slice(laborAddedElsewhere.length))
  }, [laborAddedElsewhere])

  const applyPartsAddedElsewhere = useCallback(() => {
    if (partsAddedElsewhere.length === 0) return
    dirtySetPartItems((prev) => [...prev, ...partsAddedElsewhere])
    setPartsAddedElsewhere([])
  }, [partsAddedElsewhere, dirtySetPartItems])

  const commitPartsAddedElsewhere = useCallback(() => {
    if (partsAddedElsewhere.length === 0) return
    setPartItems((prev) => [...prev, ...partsAddedElsewhere])
    setPartsAddedElsewhere((current) => current.slice(partsAddedElsewhere.length))
  }, [partsAddedElsewhere])

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
    /** A link the save refused to let through, waiting on the person: stay or leave. */
    blockedLeave,
    stayOnPage,
    leaveWithoutSaving,
    lastSaveErrorRef,
    leavingRef,
    autosaveRunRef,
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
    markSaved,
    editRevisionRef,
    saveNow,
    confirmedReading,
    confirmedReadingRef,
    confirmReading,
    acknowledgeSavedLines,
    sendingLinesRef,
    /** The job's fields this page changed, for a save to send (see workOrderFields). */
    fieldChanges,
    beginFieldSave,
    acknowledgeSavedFields,
    lineEditsForSave,
    settleLineEdits,
    /** Server values for the sections that keep their own copy of a field. */
    adoptedFields,
    /** Fields this page changed that were saved elsewhere too; see the banner. */
    changedElsewhere,
    dismissChangedElsewhere,
    /**
     * Whether edits are still unsaved, read at the moment of the call. For
     * code that awaits saveNow and has to know whether the save went
     * through: a save the rules refuse resolves too, and leaves this true.
     */
    isDirty: () => hasUnsavedChangesRef.current,
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
    taxableShare,
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
    /** After a save has written them: they join the list as ordinary saved lines. */
    commitLaborAddedElsewhere,
    /** The same four for parts. */
    partsAddedElsewhere,
    applyPartsAddedElsewhere,
    partItemsForSave,
    commitPartsAddedElsewhere,
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
