'use client'

import { useEffect, type ComponentProps, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, Globe, Receipt } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SharedLinkCard } from '@/components/shared-link-card'
import { CustomFieldsForm } from '@/features/custom-fields/Components/CustomFieldsForm'
import { JobClockSection } from '@/features/time-tracking/Components/JobClockSection'
import { StoreTiresButton } from '@/features/tire-hotel/Components/StoreTiresButton'
import { TireSetBanner } from '@/features/tire-hotel/Components/TireSetBanner'
import { revokePublicLink } from '@/features/vehicles/Actions/serviceActions'
import { PaymentsSection } from '../../service-detail/PaymentsSection'
import { ServiceFindingsSection } from '../../service-detail/ServiceFindingsSection'
import { paymentStatusColors, paymentStatusLabels } from '../../service-detail/types'
import { ConcernsSection } from '../../service-edit/ConcernsSection'
import { InvoiceDetailsSection } from '../../service-edit/InvoiceDetailsSection'
import { LaborEditor } from '../../service-edit/LaborEditor'
import { NotesSection } from '../../service-edit/NotesSection'
import { PartsEditor } from '../../service-edit/PartsEditor'
import { ScheduleTimesSection } from '../../service-edit/ScheduleTimesSection'
import { TotalsSection } from '../../service-edit/TotalsSection'
import type { DetailsLeftColumn } from '../DetailsLeftColumn'
import type { DetailsRightColumn } from '../DetailsRightColumn'
import { VideoCallSection } from '../VideoCallSection'
import { WarrantySection } from '../WarrantySection'
import { ActivityCard } from './ActivityCard'
import { FilesMediaCard } from './FilesMediaCard'
import { JobFactsCard } from './JobFactsCard'
import { StatusStepper } from './StatusStepper'

type LeftProps = ComponentProps<typeof DetailsLeftColumn>
type RightProps = ComponentProps<typeof DetailsRightColumn>

export interface ModernDetailsProps extends LeftProps, Omit<RightProps, keyof LeftProps> {
  /** A locked invoice disables every field; photos and the hero stay live. */
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
  /** A link that used to open the status reports tab lands on the files card, with that tab open. */
  scrollToFiles?: boolean
  onBackToClassic: () => void
  /** The job's title as the header currently holds it, saved with the form. */
  title: string
  /** Opens the finding form already pointed at one concern. */
  onAddFindingForConcern?: (concernId: string) => void
  files: Omit<ComponentProps<typeof FilesMediaCard>, 'serviceRecordId' | 'customerId'>
  onPreviewInvoice: () => void
  onSendToCustomer: () => void
}

/**
 * Disables what is inside it when the invoice is locked, natively, the way
 * the classic page's single fieldset does. There are several on this page
 * because the files card sits between them and must stay usable;
 * display:contents keeps each one out of the layout.
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
 * The details tab of the overhauled work order page.
 *
 * Every section here is the component the classic page uses, told by context
 * to draw the house card instead of its old frame. Nothing about how the job
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
    findings = [],
    tireSet = null,
    tireHotelEnabled = false,
    tireThresholds,
    notificationHistory = [],
  } = props
  const t = useTranslations('service')
  const tClock = useTranslations('timeTracking.job')
  const tConcerns = useTranslations('service.concerns')
  const router = useRouter()

  const customer = record.customer ?? record.vehicle?.customer ?? null

  // Closing a job with a concern nobody has confirmed as fixed is how a car
  // comes back. It is asked about, not refused: a routine service has nothing
  // to confirm, and a shop may know better than the tick does.
  const confirmUnconfirmed = useConfirm()
  const changeStatus = async (next: string) => {
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
    formState.dirtySetStatus(next)
  }

  useEffect(() => {
    if (scrollToFiles) document.getElementById('files-media')?.scrollIntoView()
  }, [scrollToFiles])

  const answeredCounts = findings.reduce<Record<string, number>>((counts, finding) => {
    if (finding.concernId) counts[finding.concernId] = (counts[finding.concernId] ?? 0) + 1
    return counts
  }, {})

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

  return (
    // One scroller for the whole page, with the classic page's padding. The
    // width is capped, but only where it starts to hurt: 1440px left empty
    // bands on an ordinary desktop monitor, so the cap is 1800px, which a
    // 1920px screen with the app sidebar open never reaches. The
    // container query, not the viewport, decides when the two columns fit,
    // because the app sidebar can be open or closed.
    <div
      data-testid="service-layout-modern"
      className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-4 pb-40">
        {/* noValidate, and the rules checked in handleSubmit instead; see the
            classic form in ServicePageClient. display:contents, so the form's
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
            value={formState.initialData.serviceDate || new Date().toISOString().split('T')[0]}
          />
          <Lockable locked={locked} label={lockedLabel}>
            <StatusStepper status={formState.status} onChange={(next) => void changeStatus(next)} />
          </Lockable>

          {/* The side column gives way before the job does: the parts and labour
            editors turn into a table at 672px of their own, so two columns
            start only where the job column still gets that, and the side
            column grows to the mock's 424px as room appears. The app sidebar
            can be open or closed, hence container widths, not the viewport's. */}
          <div className="grid grid-cols-1 items-start gap-3 @[1080px]:grid-cols-[minmax(0,1fr)_320px] @[1240px]:grid-cols-[minmax(0,1fr)_380px] @[1400px]:grid-cols-[minmax(0,1fr)_424px]">
            <div data-testid="service-main" className="@container flex min-w-0 flex-col gap-3">
              <Lockable locked={locked}>
                <JobFactsCard
                  record={record}
                  initialData={formState.initialData}
                  vehicleName={formState.vehicleName}
                  selectedVehicleId={formState.selectedVehicleId}
                  setSelectedVehicleId={formState.dirtySetSelectedVehicleId}
                  techName={formState.techName}
                  initialVehicle={props.initialVehicle}
                />

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

                {storeTires && <div className="flex justify-end">{storeTires}</div>}
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
                />

                <JobClockSection
                  serviceRecordId={record.id}
                  initial={props.jobClock}
                  onAddLabor={(hours) =>
                    formState.dirtySetLaborItems((prev) => [
                      ...prev,
                      {
                        description: tClock('laborDescription'),
                        hours,
                        rate: props.defaultLaborRate,
                        total: Math.round(hours * props.defaultLaborRate * 100) / 100,
                        pricingType: 'hourly' as const,
                      },
                    ])
                  }
                />

                <PartsEditor
                  partItems={formState.partItems}
                  setPartItems={formState.dirtySetPartItems}
                  updatePart={formState.updatePart}
                  partsSubtotal={formState.partsSubtotal}
                  currencyCode={currencyCode}
                  hasInventory={props.inventoryParts.length > 0}
                  inventoryParts={props.inventoryParts}
                  onOpenInventory={() => formState.setShowInventoryPicker(true)}
                  onScanBarcode={props.onScanBarcode}
                  defaultMarkupPercent={props.defaultMarkupPercent}
                  markupAppliesToInventory={props.markupAppliesToInventory}
                />
              </Lockable>

              <FilesMediaCard serviceRecordId={record.id} customerId={customer?.id} {...files} />

              <Lockable locked={locked}>
                <NotesSection
                  initialData={formState.initialData}
                  onNotesChange={formState.handleNotesChange}
                  serviceRecordId={record.id}
                  aiEnabled={props.aiEnabled}
                />
              </Lockable>
            </div>

            <aside data-testid="service-sidebar" className="flex min-w-0 flex-col gap-3">
              <Lockable locked={locked}>
                <ScheduleTimesSection
                  serviceRecordId={record.id}
                  technicians={props.boardTechnicians}
                  workBays={props.workBays}
                  orgMembers={props.orgMembers}
                  initialStartDateTime={formState.initialData.startDateTime}
                  initialEndDateTime={formState.initialData.endDateTime}
                  initialTechnicianId={record.technicianId}
                  initialWorkBayId={record.workBayId}
                  initialPromisedAt={
                    record.promisedAt ? new Date(record.promisedAt).toISOString() : null
                  }
                  onSaved={formState.flashSaved}
                />

                <WarrantySection
                  value={formState.warranty}
                  onChange={formState.dirtySetWarranty}
                  texts={props.warrantyTexts}
                  distanceUnit={unitSystem === 'metric' ? 'km' : 'mi'}
                  serviceDate={formState.initialData.serviceDate}
                />

                <AppCard
                  icon={Receipt}
                  title={t('modern.invoiceTitle')}
                  action={
                    <Badge
                      variant="outline"
                      className={`text-xs ${paymentStatusColors[formState.paymentStatus] || ''}`}
                    >
                      {paymentStatusLabels[formState.paymentStatus] || t('header.unpaid')}
                    </Badge>
                  }
                  contentClassName="p-0"
                >
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
                      onTogglePaid={actions.handleTogglePaid}
                      designOptions={props.designOptions}
                      designId={record.designId ?? null}
                      designFollowsName={props.designFollowsName}
                      designPinnedAt={props.designPinnedAt}
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
                      totalAmount={formState.totalAmount}
                      currencyCode={currencyCode}
                    />
                  </div>
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
                    />
                  </div>
                </AppCard>
              </Lockable>

              {/* Outside the lock, as the header's own Preview and Share are:
                looking at an issued invoice and sending it again are exactly
                what a locked one is for. */}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={props.onPreviewInvoice}>
                  <Eye className="mr-1.5 h-4 w-4" />
                  {t('modern.previewInvoice')}
                </Button>
                <Button type="button" variant="outline" onClick={props.onSendToCustomer}>
                  <Globe className="mr-1.5 h-4 w-4" />
                  {t('modern.sendToCustomer')}
                </Button>
              </div>

              <Lockable locked={locked}>
                {record.publicToken && (
                  <SharedLinkCard
                    publicToken={record.publicToken}
                    organizationId={props.organizationId}
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

                <CustomFieldsForm
                  entityId={record.id}
                  entityType="service_record"
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

        {/* The same way back as the menu's, where somebody who has scrolled
            the whole page looking for the old one will find it. */}
        <button
          type="button"
          onClick={props.onBackToClassic}
          className="cursor-pointer self-center text-[13px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {t('modern.backToClassic')}
        </button>
      </div>
    </div>
  )
}
