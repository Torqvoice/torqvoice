'use client'

import { useDateSettings } from '@/components/date-settings-context'
import { workshopTodayKey } from '@/lib/workshop-datetime'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Receipt } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { useStableCallback } from '@/hooks/use-stable-callback'
import { Badge } from '@/components/ui/badge'
import { SharedLinkCard } from '@/components/shared-link-card'
import { CustomFieldsForm } from '@/features/custom-fields/Components/CustomFieldsForm'
import { JobClockSection } from '@/features/time-tracking/Components/JobClockSection'
import { StoreTiresButton } from '@/features/tire-hotel/Components/StoreTiresButton'
import { TireSetBanner } from '@/features/tire-hotel/Components/TireSetBanner'
import {
  revokePublicLink,
  updateInternalNotes,
  updateServiceStatus,
} from '@/features/vehicles/Actions/serviceActions'
import { toast } from 'sonner'
import { revealRequiredMeters } from '@/features/meters/Lib/requiredMetersReveal'
import { PaymentsSection } from '../../service-detail/PaymentsSection'
import { ServiceFindingsSection } from '../../service-detail/ServiceFindingsSection'
import { paymentStatusColors, paymentStatusLabels } from '../../service-detail/types'
import { ConcernsSection as ConcernsSectionBase } from '../../service-edit/ConcernsSection'
import { InvoiceDetailsSection as InvoiceDetailsSectionBase } from '../../service-edit/InvoiceDetailsSection'
import { LaborEditor as LaborEditorBase } from '../../service-edit/LaborEditor'
import { servicePartFromFluid } from '../../labor-guide/guide-lines'
import { NotesSection as NotesSectionBase } from '../../service-edit/NotesSection'
import { PartsEditor as PartsEditorBase } from '../../service-edit/PartsEditor'
import { ScheduleTimesSection as ScheduleTimesSectionBase } from '../../service-edit/ScheduleTimesSection'
import { TotalsSection } from '../../service-edit/TotalsSection'
import { VideoCallSection as VideoCallSectionBase } from '../VideoCallSection'
import { WarrantySection as WarrantySectionBase } from '../WarrantySection'
import type { WorkOrderJobProps, WorkOrderSidebarProps } from './details-props'
import { ActivityCard as ActivityCardBase } from './ActivityCard'
import { FilesMediaCard as FilesMediaCardBase } from './FilesMediaCard'
import { JobFactsCard as JobFactsCardBase } from './JobFactsCard'
import { MoneyBar, MoneyLine } from './MoneyBar'
import { isCancelled, type WorkOrderStatusOption } from '@/features/work-order-statuses/Lib/stages'
import { StatusStepper as StatusStepperBase } from './StatusStepper'
import { vehicleName } from '@/lib/vehicle-name'

/**
 * The sections of the page, memoized. The form's state lives at the top of
 * the page, so every keystroke in a line renders this component; without
 * these, it also rendered every card on the page, the ones that show nothing
 * of what was typed included. Each is drawn again only when something it is
 * handed changes, which is why the handlers below keep their identity.
 */
const StatusStepper = memo(StatusStepperBase)
const JobFactsCard = memo(JobFactsCardBase)
const ConcernsSection = memo(ConcernsSectionBase)
const LaborEditor = memo(LaborEditorBase)
const PartsEditor = memo(PartsEditorBase)
const FilesMediaCard = memo(FilesMediaCardBase)
const NotesSection = memo(NotesSectionBase)
const ScheduleTimesSection = memo(ScheduleTimesSectionBase)
const InvoiceDetailsSection = memo(InvoiceDetailsSectionBase)
const WarrantySection = memo(WarrantySectionBase)
const VideoCallSection = memo(VideoCallSectionBase)
const ActivityCard = memo(ActivityCardBase)
const CustomFieldsFormMemo = memo(CustomFieldsForm)
const JobClockSectionMemo = memo(JobClockSection)

const NO_FINDINGS: NonNullable<WorkOrderJobProps['findings']> = []
const NO_NOTIFICATIONS: NonNullable<WorkOrderSidebarProps['notificationHistory']> = []

export interface ModernDetailsProps
  extends WorkOrderJobProps,
    Omit<WorkOrderSidebarProps, keyof WorkOrderJobProps> {
  /** The workshop's own statuses, for the menus on the stepper. */
  workOrderStatuses?: WorkOrderStatusOption[]
  /** The viewer may change settings, so the status menus offer to add a status. */
  canAddStatus?: boolean
  /** The viewer may edit vehicles, so an empty Customer box offers to add one. */
  canSetCustomer?: boolean
  /** Bumped by every "Take payment", the money bar's and the header's: the payments form opens. */
  paymentSignal: number
  onTakePayment: () => void
  /** Offers to tell the customer about a status that asks for it. */
  onNotifyForStatus?: (status: WorkOrderStatusOption) => void
  /**
   * A locked invoice disables what it freezes: the lines, totals, invoice
   * fields, warranty, notes and custom fields. Status, booking, clock,
   * payments, sharing and files stay live.
   */
  locked: boolean
  lockedLabel?: string
  /**
   * The work order form itself. It is drawn in here rather than around this
   * component because the page holds things that are not part of the job's
   * save (status reports), and those have to sit outside the form element.
   */
  form: Pick<ComponentProps<'form'>, 'id' | 'ref' | 'onSubmit' | 'onInput'>
  /** Sections under the two columns that save on their own, outside the form. */
  belowForm?: ReactNode
  /** A link with a `?tab=` query lands on the files card, with that tab open. */
  scrollToFiles?: boolean
  /** The job's title as the header currently holds it, saved with the form. */
  title: string
  /** The connected AI vendor can transcribe speech, so dictation goes through it. */
  aiTranscription?: boolean
  dictationMode?: 'ai' | 'choice'
  /** Opens the finding form already pointed at one concern. */
  onAddFindingForConcern?: (concernId: string) => void
  files: Omit<ComponentProps<typeof FilesMediaCardBase>, 'serviceRecordId' | 'customerId'>
  onPreviewInvoice: () => void
  onSendToCustomer: () => void
}

/**
 * Disables what is inside it when the invoice is locked, natively. There are
 * several on this page rather than one around it all, because the files card
 * sits between them and must stay usable; display:contents keeps each one out
 * of the layout.
 */
function Lockable({
  locked,
  label,
  children,
}: {
  locked: boolean
  label?: string
  children: ReactNode
}) {
  return (
    <fieldset disabled={locked} className="contents" aria-label={locked ? label : undefined}>
      {children}
    </fieldset>
  )
}

/**
 * The body of the work order page.
 *
 * Every section here is a component the quote page shares, told by context
 * to draw the house card instead of its own frame. Nothing about how the job
 * is saved lives in this file: the same form wraps it, the same hooks feed
 * it, and each named field is still in the document once. What changes is
 * where things sit: who and what first, then the work in the order it is
 * done, with everything about money and the booking in the column beside it.
 */
export function ModernDetails(props: ModernDetailsProps) {
  const {
    formState,
    actions,
    record,
    locked,
    lockedLabel,
    form,
    belowForm,
    scrollToFiles = false,
    files,
    currencyCode,
    unitSystem = 'metric',
    vehicleId,
    findings = NO_FINDINGS,
    tireSet = null,
    tireHotelEnabled = false,
    tireThresholds,
    notificationHistory = NO_NOTIFICATIONS,
  } = props
  const t = useTranslations('service')
  const { timezone } = useDateSettings()
  const tClock = useTranslations('timeTracking.job')
  // What the labor guide matches a fluid against, priced the way a pick from stock is here.
  const { inventoryParts, defaultMarkupPercent, markupAppliesToInventory } = props
  const guideStock = useMemo(
    () => ({ parts: inventoryParts, pricing: { defaultMarkupPercent, markupAppliesToInventory } }),
    [inventoryParts, defaultMarkupPercent, markupAppliesToInventory]
  )
  const tConcerns = useTranslations('service.concerns')
  const router = useRouter()

  const customer = record.customer ?? record.vehicle?.customer ?? null

  // Closing a job with a concern nobody has confirmed as fixed is how a car
  // comes back. It is asked about, not refused: a routine service has nothing
  // to confirm, and a shop may know better than the tick does.
  const confirmUnconfirmed = useConfirm()
  // The workshop's own status the job carries. Held here as well as on the
  // record so the stepper answers at once, before the page has been re-read.
  const [customStatus, setCustomStatus] = useState(record.customStatus ?? null)
  // Keyed on what is drawn, not on the object: the record arrives as a new
  // object on every refresh, and a status renamed or recoloured in settings
  // keeps its id while what the stepper shows has changed.
  const recordCustomKey = record.customStatus
    ? `${record.customStatus.id}:${record.customStatus.name}:${record.customStatus.color}`
    : ''
  useEffect(() => {
    setCustomStatus(record.customStatus ?? null)
  }, [recordCustomKey]) // eslint-disable-line react-hooks/exhaustive-deps -- see above

  const changeStatus = async (next: string, custom: WorkOrderStatusOption | null = null) => {
    const open = formState.concerns.filter((c) => c.description.trim() && !c.confirmed)
    if (next === 'completed' && open.length > 0) {
      const ok = await confirmUnconfirmed({
        title: tConcerns('unconfirmedTitle'),
        description: `${tConcerns('unconfirmedBody', { count: open.length })} ${open
          .map((c) => `"${c.description.trim()}"`)
          .join(', ')}`,
        confirmLabel: tConcerns('unconfirmedProceed'),
      })
      if (!ok) return
    }
    // Completing a job whose vehicle is being changed goes with the form's
    // save, and at once: the server asks for the required readings of the
    // vehicle the save moves it to. Completed on its own, it was asked about
    // the vehicle it is leaving, and the save after it moved a completed job
    // that nothing had asked about.
    if (next === 'completed' && formState.selectedVehicleId !== (vehicleId ?? null)) {
      formState.lastSaveErrorRef.current = null
      // Drawn before the save reads it: the form's submit handler sends the
      // stage it was rendered with.
      flushSync(() => formState.dirtySetStatus(next))
      await formState.saveNow()
      // One of the workshop's own statuses is set once the job is completed
      // on its new vehicle, never before: refused, it is still on the old one.
      if (custom && formState.lastSaveErrorRef.current === null) {
        const result = await updateServiceStatus(record.id, next, custom.id)
        if (result.success) setCustomStatus(custom)
        else toast.error(result.error || t('page.failedUpdate'))
      }
      return
    }
    // Completing a job the workshop asks meter readings of is saved on its
    // own too: refused, it names the meters and marks their boxes, and the
    // rest of the form is not held back with it.
    const asksMeters =
      next === 'completed' && (formState.initialData.meters ?? []).some((m) => m.required)
    // A plain move between stages, with none of the workshop's statuses on
    // either side of it, goes with the form as it always has. Completing is
    // saved at once, as a save the person asked for: a refusal for a reading
    // (a meter made required since the page was opened) then takes them to
    // the box, where an autosave five seconds later could only mark it.
    if (!locked && !custom && !customStatus && !asksMeters) {
      if (next !== 'completed') {
        formState.dirtySetStatus(next)
        return
      }
      flushSync(() => formState.dirtySetStatus(next))
      void formState.saveNow()
      return
    }
    // Everything else is saved on its own, the way the work board moves a
    // card. A locked invoice refuses the form's save, but the lock freezes
    // what the invoice says is owed, not how far along the job is. And one of
    // the workshop's statuses is not a field of the form at all: it is chosen,
    // and dropped, here.
    const previous = { status: formState.status, custom: customStatus }
    formState.setStatus(next)
    setCustomStatus(custom)
    const result = await updateServiceStatus(record.id, next, custom?.id ?? null)
    if (result.success) {
      formState.flashSaved()
      router.refresh()
      // Asked, never sent: the desk decides whether this customer hears.
      if (custom?.notifyCustomer) props.onNotifyForStatus?.(custom)
    } else {
      // Back to where it was, unless another stage was picked while this one
      // was on its way: that choice is newer and stays.
      formState.setStatus((current) => (current === next ? previous.status : current))
      setCustomStatus((current) => (current === custom ? previous.custom : current))
      toast.error(result.error || t('page.failedUpdate'))
      // Pressed by the person: the first empty box takes the focus.
      revealRequiredMeters(record.id, result.requiredMeters, { focus: true })
    }
  }

  // The same handlers on every render, for the memoized sections: each runs
  // the version from the latest render, so nothing it reads is stale.
  const onStepperChange = useStableCallback(
    (next: string, custom: WorkOrderStatusOption | null) => void changeStatus(next, custom)
  )
  const { flashSaved, dirtySetPartItems, dirtySetLaborItems, setShowInventoryPicker } = formState
  const onReferenceSaved = useCallback(() => {
    flashSaved()
    router.refresh()
  }, [flashSaved, router])
  const onCustomerAdded = useCallback(() => router.refresh(), [router])
  const onAddGuidePart = useCallback(
    (line: Parameters<typeof servicePartFromFluid>[0]) =>
      dirtySetPartItems((prev) => [servicePartFromFluid(line), ...prev]),
    [dirtySetPartItems]
  )
  const onOpenInventory = useCallback(() => setShowInventoryPicker(true), [setShowInventoryPicker])
  const clockLaborDescription = tClock('laborDescription')
  const { defaultLaborRate } = props
  const addClockLabor = useCallback(
    (hours: number) =>
      dirtySetLaborItems((prev) => [
        ...prev,
        {
          description: clockLaborDescription,
          hours,
          rate: defaultLaborRate,
          total: Math.round(hours * defaultLaborRate * 100) / 100,
          pricingType: 'hourly' as const,
        },
      ]),
    [dirtySetLaborItems, clockLaborDescription, defaultLaborRate]
  )
  const onTogglePaid = useStableCallback(actions.handleTogglePaid)
  const helperIds = useMemo(() => record.helpers?.map((h) => h.technicianId), [record.helpers])
  const vehicleLabel = record.vehicle ? `${vehicleName(record.vehicle)}` : undefined

  // Internal notes on a locked invoice. The form's save is refused there, but
  // these notes are never printed or shared, so they are saved on their own,
  // a moment after the typing stops. Unlocked, they go with the form as always.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingNotes = useRef<string | null>(null)
  const saveInternalNotes = async (html: string) => {
    const result = await updateInternalNotes(record.id, html)
    if (result.success) formState.flashSaved()
    else toast.error(t('page.failedUpdate'))
  }
  const onNotesChange = useStableCallback(
    (field: 'invoiceNotes' | 'diagnosticNotes' | 'description', value: string) => {
      // Keeps the form's copy current; it marks nothing dirty while locked.
      formState.handleNotesChange(field, value)
      if (!locked || field !== 'diagnosticNotes') return
      pendingNotes.current = value
      if (notesTimer.current) clearTimeout(notesTimer.current)
      notesTimer.current = setTimeout(() => {
        notesTimer.current = null
        const html = pendingNotes.current
        pendingNotes.current = null
        if (html !== null) void saveInternalNotes(html)
      }, 800)
    }
  )
  // Leaving the page mid-sentence still saves what was typed.
  useEffect(() => {
    const recordId = record.id
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current)
      if (pendingNotes.current !== null) void updateInternalNotes(recordId, pendingNotes.current)
    }
  }, [record.id])

  useEffect(() => {
    if (scrollToFiles) document.getElementById('files-media')?.scrollIntoView()
  }, [scrollToFiles])

  const answeredCounts = useMemo(
    () =>
      findings.reduce<Record<string, number>>((counts, finding) => {
        if (finding.concernId) counts[finding.concernId] = (counts[finding.concernId] ?? 0) + 1
        return counts
      }, {}),
    [findings]
  )

  const storeTires =
    tireHotelEnabled && record.vehicle ? (
      <StoreTiresButton
        serviceRecordId={record.id}
        hasSet={!!tireSet}
        canBill={!locked}
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

  return (
    <>
      {/* One scroller for the whole page. The
          width is capped, but only where it starts to hurt: 1440px left empty
          bands on an ordinary desktop monitor, so the cap is 1800px, which a
          1920px screen with the app sidebar open never reaches. The container
          query, not the viewport, decides when the two columns fit, because
          the app sidebar can be open or closed. */}
      <div
        data-testid="service-layout-modern"
        className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* Below `md` the app's navigation is fixed over the bottom of the
            screen; the money bar used to hold the page clear of it, and with
            the bar gone below `lg` the padding does. */}
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-4 pb-[calc(2.5rem+58px+env(safe-area-inset-bottom))] md:pb-10">
          {/* noValidate, and the rules checked in handleSubmit instead: an autosave
            submits through requestSubmit, which native validation would stop with
            no message and no request. display:contents, so the form's
            children are laid out by this column as if it were not there. */}
          <form {...form} className="contents" noValidate>
            {/* The title is edited in the header, which is not inside this form,
              and the save reads its fields from the form. So the value lives
              here, hidden, and follows what the header holds. The service date
              has no field on either page and travels the same way. */}
            <input type="hidden" name="title" value={props.title} />
            <input
              type="hidden"
              name="serviceDate"
              value={formState.initialData.serviceDate || workshopTodayKey(timezone)}
            />
            {/* Outside the lock: a locked invoice still moves along. A
                cancelled one does not move at all; the banner above says so. */}
            {isCancelled(formState.status) ? null : (
              <StatusStepper
                status={formState.status}
                customStatus={customStatus}
                options={props.workOrderStatuses}
                canAddStatus={props.canAddStatus}
                onChange={onStepperChange}
              />
            )}

            {/* The side column gives way before the job does: the parts and labour
            editors turn into a table at 672px of their own, so two columns
            start only where the job column still gets that, and the side
            column grows to the mock's 424px as room appears. The app sidebar
            can be open or closed, hence container widths, not the viewport's. */}
            <div className="grid grid-cols-1 items-start gap-3 @[1080px]:grid-cols-[minmax(0,1fr)_320px] @[1240px]:grid-cols-[minmax(0,1fr)_380px] @[1400px]:grid-cols-[minmax(0,1fr)_424px]">
              <div data-testid="service-main" className="@container flex min-w-0 flex-col gap-3">
                {/* Outside the lock: "More info" and copying the VIN work on a
                    locked invoice; the card disables its own fields. */}
                <JobFactsCard
                  record={record}
                  currencyCode={currencyCode}
                  locked={locked}
                  initialData={formState.initialData}
                  vehicleName={formState.vehicleName}
                  selectedVehicleId={formState.selectedVehicleId}
                  setSelectedVehicleId={formState.dirtySetSelectedVehicleId}
                  techName={formState.techName}
                  initialVehicle={props.initialVehicle}
                  onReferenceChange={props.onReferenceChange}
                  onReferenceSaved={onReferenceSaved}
                  distanceUnit={unitSystem === 'metric' ? 'km' : 'mi'}
                  confirmedReading={formState.confirmedReading}
                  onConfirmReading={formState.confirmReading}
                  canSetCustomer={props.canSetCustomer}
                  onCustomerAdded={onCustomerAdded}
                />

                <Lockable locked={locked}>
                  <ConcernsSection
                    concerns={formState.concerns}
                    setConcerns={formState.setConcerns}
                    onChange={formState.markDirty}
                    answeredCounts={answeredCounts}
                    findings={findings}
                    onAddFinding={props.onAddFindingForConcern}
                    onEditFinding={props.onEditFinding}
                    serviceRecordId={record.id}
                    media={record.attachments}
                    serverTranscription={props.aiTranscription}
                    dictationMode={props.dictationMode}
                  />

                  {vehicleId && (
                    <ServiceFindingsSection
                      vehicleId={vehicleId}
                      serviceRecordId={record.id}
                      findings={findings}
                      onAddFinding={props.onAddFinding}
                      onEditFinding={props.onEditFinding}
                    />
                  )}

                  {storeTires}
                  {tireSet && (
                    <TireSetBanner
                      set={tireSet}
                      serviceRecordId={record.id}
                      thresholds={tireThresholds}
                    />
                  )}

                  <LaborEditor
                    laborItems={formState.laborItems}
                    setLaborItems={formState.dirtySetLaborItems}
                    updateLabor={formState.updateLabor}
                    laborSubtotal={formState.laborSubtotal}
                    currencyCode={currencyCode}
                    defaultLaborRate={props.defaultLaborRate}
                    hasPresets={props.hasPresets}
                    onOpenPresets={props.onOpenPresets}
                    onAddFinding={props.onAddFinding}
                    openObservationsCount={props.openObservationsCount}
                    onShowExistingObservations={props.onShowExistingObservations}
                    vehicleId={record.vehicle?.id ?? null}
                    vehicleLabel={vehicleLabel}
                    guideStock={guideStock}
                    onAddGuidePart={onAddGuidePart}
                  />

                  <PartsEditor
                    partItems={formState.partItems}
                    setPartItems={formState.dirtySetPartItems}
                    updatePart={formState.updatePart}
                    partsSubtotal={formState.partsSubtotal}
                    currencyCode={currencyCode}
                    hasInventory={props.inventoryParts.length > 0}
                    inventoryParts={props.inventoryParts}
                    onOpenInventory={onOpenInventory}
                    onScanBarcode={props.onScanBarcode}
                    defaultMarkupPercent={props.defaultMarkupPercent}
                    markupAppliesToInventory={props.markupAppliesToInventory}
                  />
                </Lockable>

                {/* Below `lg` only, where there is no money bar. */}
                <MoneyLine
                  total={formState.displayTotal}
                  paid={formState.totalPaid}
                  balance={formState.balanceDue}
                  currencyCode={currencyCode}
                />

                <FilesMediaCard serviceRecordId={record.id} customerId={customer?.id} {...files} />

                {/* Outside the lock: the customer notes freeze with the invoice,
                    the internal ones keep saving on their own. */}
                <NotesSection
                  initialData={formState.initialData}
                  onNotesChange={onNotesChange}
                  serviceRecordId={record.id}
                  aiEnabled={props.aiEnabled}
                  publicLocked={locked}
                />
              </div>

              {/* A locked invoice freezes what it says is owed: its lines, totals,
                number, dates, design and warranty. The booking, the clock, the
                payments and the sharing save through their own actions and stay
                usable, as src/lib/document-lock.ts intends. */}
              <aside data-testid="service-sidebar" className="flex min-w-0 flex-col gap-3">
                <ScheduleTimesSection
                  serviceRecordId={record.id}
                  technicians={props.boardTechnicians}
                  workBays={props.workBays}
                  orgMembers={props.orgMembers}
                  initialStartDateTime={formState.initialData.startDateTime}
                  initialEndDateTime={formState.initialData.endDateTime}
                  initialTechnicianId={record.technicianId}
                  initialHelperIds={helperIds}
                  initialWorkBayId={record.workBayId}
                  initialPromisedAt={
                    record.promisedAt ? new Date(record.promisedAt).toISOString() : null
                  }
                  onSaved={formState.flashSaved}
                />

                {/* Beside who is on the job and when, not between the labour
                    and the parts: it says how the work is going, and the two
                    cards it sat between are the invoice being built. "Add as
                    labour" still puts its line in the labour card. */}
                <JobClockSectionMemo
                  serviceRecordId={record.id}
                  initial={props.jobClock}
                  onAddLabor={locked ? undefined : addClockLabor}
                />

                <AppCard
                  icon={Receipt}
                  title={t('modern.invoiceTitle')}
                  action={
                    <Badge
                      variant="outline"
                      className={`text-xs ${paymentStatusColors[formState.paymentStatus] || ''}`}
                      data-testid="payment-status"
                    >
                      {paymentStatusLabels[formState.paymentStatus] || t('header.unpaid')}
                    </Badge>
                  }
                  contentClassName="p-0"
                >
                  <Lockable locked={locked}>
                    <div className="border-b border-card-edge/60 p-5 pt-4">
                      <InvoiceDetailsSection
                        part="invoice"
                        initialData={formState.initialData}
                        type={formState.type}
                        setType={formState.dirtySetType}
                        status={formState.status}
                        setStatus={formState.dirtySetStatus}
                        onDirty={formState.markDirty}
                        paymentStatus={formState.paymentStatus}
                        onTogglePaid={onTogglePaid}
                        designOptions={props.designOptions}
                        designId={record.designId ?? null}
                        designFollowsName={props.designFollowsName}
                        designFollowsRule={props.designFollowsRule}
                      />
                    </div>
                    <div className="border-b border-card-edge/60 p-5">
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
                        taxEnabled={props.taxEnabled}
                        taxRate={formState.taxRate}
                        setTaxRate={formState.dirtySetTaxRate}
                        taxAmount={formState.taxAmount}
                        taxInclusive={formState.taxInclusive}
                        taxComponents={formState.taxComponents}
                        taxableShare={formState.taxableShare}
                        totalAmount={formState.totalAmount}
                        currencyCode={currencyCode}
                      />
                    </div>
                  </Lockable>
                  <div className="space-y-3 p-5">
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
                      openFormSignal={props.paymentSignal}
                      extraAction={props.payCode}
                      cancelled={isCancelled(formState.status)}
                    />
                  </div>
                </AppCard>

                {/* Under the invoice, not over it: the warranty is set once, the
                    invoice card is used on every job. */}
                <Lockable locked={locked} label={lockedLabel}>
                  <WarrantySection
                    value={formState.warranty}
                    onChange={formState.dirtySetWarranty}
                    texts={props.warrantyTexts}
                    distanceUnit={unitSystem === 'metric' ? 'km' : 'mi'}
                    serviceDate={formState.initialData.serviceDate}
                  />
                </Lockable>

                {record.publicToken && (
                  <SharedLinkCard
                    documentId={record.id}
                    publicToken={record.publicToken}
                    organizationId={props.organizationId}
                    type="invoice"
                    sharedAt={record.sharedAt}
                    viewCount={record.viewCount}
                    lastViewedAt={record.lastViewedAt}
                    onRevoke={async () => {
                      const result = await revokePublicLink(record.id)
                      if (result.success) router.refresh()
                      return result.success
                    }}
                  />
                )}

                {props.videoCall && (
                  <VideoCallSection
                    serviceRecordId={record.id}
                    videoCall={props.videoCall}
                    scheduled={Boolean(formState.initialData.startDateTime)}
                    customer={customer}
                    smsEnabled={props.smsEnabled}
                    emailEnabled={props.emailEnabled}
                    telegramEnabled={props.telegramEnabled}
                  />
                )}

                <Lockable locked={locked}>
                  <CustomFieldsFormMemo
                    entityId={record.id}
                    entityType="service_record"
                    locked={locked}
                    onValuesReady={formState.onCustomFieldsReady}
                    onChange={formState.markDirty}
                  />
                </Lockable>

                <ActivityCard
                  record={record}
                  currencyCode={currencyCode}
                  notificationHistory={notificationHistory}
                />
              </aside>
            </div>
          </form>

          {belowForm}
        </div>
      </div>

      <MoneyBar
        total={formState.displayTotal}
        paid={formState.totalPaid}
        balance={formState.balanceDue}
        currencyCode={currencyCode}
        onTakePayment={props.onTakePayment}
        payCode={props.payCode}
        cancelled={isCancelled(formState.status)}
        onPreview={props.onPreviewInvoice}
        onSend={props.onSendToCustomer}
      />
    </>
  )
}
