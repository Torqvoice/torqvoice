'use client'

import { ShopFeeProvider } from '@/features/settings/Components/ShopFeeContext'
import { DocumentLockBanner } from '@/components/document-lock-banner'
import { setInvoiceEditUnlocked } from '@/features/settings/Actions/documentLockActions'
import { InvoiceDesignMenu } from './InvoiceDesignMenu'
import { PayCodeButton } from './PayCodeButton'
import type { WorkOrderStatusOption } from '@/features/work-order-statuses/Lib/stages'
import { useState, useCallback, useMemo, useRef, useEffect, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { sendInvoiceEmail } from '@/features/email/Actions/emailActions'
import {
  updateServiceRecordTitle,
  updateServiceStatus,
} from '@/features/vehicles/Actions/serviceActions'
import { useConfirm } from '@/components/confirm-dialog'
import { SendEmailDialog } from '@/features/email/Components/SendEmailDialog'
import { useTranslations } from 'next-intl'

import { ServiceDetailContent } from '../service-detail/ServiceDetailContent'
import { ImageCarousel } from '../service-detail/ImageCarousel'
import { ShareDialog } from '../service-detail/ShareDialog'
import { NotifyCustomerDialog } from '@/components/notify-customer-dialog'
import { PdfPreviewDialog } from '@/components/pdf-preview-dialog'
import { InventoryPickerDialog } from '../service-edit/InventoryPickerDialog'
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { useHardwareScanner } from '@/hooks/use-hardware-scanner'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import { lookupPartByBarcode } from '@/features/inventory/Actions/lookupPartByBarcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CalendarIcon, AlertTriangle, Loader2 } from 'lucide-react'
import { deleteFinding } from '@/features/vehicles/Actions/findingActions'
import { updateServiceRecord } from '@/features/vehicles/Actions/serviceActions'
import { getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { LaborPresetPickerDialog } from '@/features/labor-presets/Components/LaborPresetPickerDialog'
import type { LaborPresetOption } from './service-page-types'
import { ServiceImagesManager } from '../service-images-manager'
import { ServiceVideoManager } from '../service-video-manager'
import { ServiceDocumentsManager } from '../service-documents-manager'
import { StatusReportList } from '@/features/status-reports/Components/StatusReportList'
import { ServiceHeaderActions, UnifiedServiceHeader, type ServiceTab } from './UnifiedServiceHeader'

import { useServiceFormState } from './useServiceFormState'
import { useServiceActions } from './useServiceActions'
import { DetailsLeftColumn } from './DetailsLeftColumn'
import { DetailsRightColumn } from './DetailsRightColumn'
import { ObservationsManager, type ObservationsControls } from './ObservationsManager'
import type { ServicePageClientProps } from './service-page-types'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { rememberWorkOrderLayout, type WorkOrderLayout } from '@/lib/work-order-layout'
import { registerAnalyticsProperties, track } from '@/lib/analytics'
import { TryNewLayoutBanner } from './TryNewLayoutBanner'
import { LaborAddedBanner } from './LaborAddedBanner'
import { useLiveRecord } from '@/features/realtime/hooks'
import { PresenceChips } from '@/features/realtime/Components/PresenceChips'
import { ModernDetails } from './modern/ModernDetails'
import { ModernHero } from './modern/ModernHero'
import { lineTotal, resolvePartPrice } from '@/features/inventory/Lib/partPricing'

export type { ServicePageClientProps, BoardTechnicianOption } from './service-page-types'

export function ServicePageClient({
  record,
  vehicleId,
  organizationId,
  lockState,
  canUnlock,
  currencyCode,
  unitSystem,
  warrantyTexts,
  tireHotelEnabled = false,
  onlinePayments = false,
  workOrderStatuses = [],
  videoCall = { link: null, providers: [] },
  tireThresholds,
  defaultTaxRate,
  taxEnabled,
  defaultLaborRate,
  shopFee = null,
  initialData,
  inventoryParts,
  initialVehicle,
  boardTechnicians = [],
  workBays = [],
  orgMembers = [],
  currentUserName,
  imageAttachmentsForManager,
  dropoffAttachments = [],
  videoAttachments,
  documentAttachments,
  maxImagesPerService,
  maxDiagnosticsPerService,
  maxDocumentsPerService,
  laborPresets = [],
  smsEnabled = false,
  emailEnabled = false,
  telegramEnabled = false,
  aiEnabled = false,
  aiTranscription = false,
  dictationMode = 'choice',
  defaultDueDays = 0,
  defaultMarkupPercent = 0,
  markupAppliesToInventory = false,
  statusReports = [],
  initialTab,
  findings = [],
  openObservations = [],
  notificationHistory = [],
  designOptions = [],
  designFollowsName = null,
  designPinnedAt = null,
  designFollowsRule = null,
  jobClock = { entries: [], viewerTechnicianIds: [], canEdit: false, timeZone: 'UTC' },
  initialLayout = 'classic',
}: ServicePageClientProps) {
  const t = useTranslations('service')
  const router = useRouter()

  // Counter sales carry the customer directly; vehicle jobs resolve it via the vehicle.
  const customer = record.customer ?? record.vehicle?.customer ?? null

  const validTabs: ServiceTab[] = ['details', 'images', 'video', 'documents', 'statusReports']
  const resolvedInitialTab =
    initialTab && validTabs.includes(initialTab as ServiceTab)
      ? (initialTab as ServiceTab)
      : 'details'

  const [storedTab, setActiveTab] = useState<ServiceTab>(resolvedInitialTab)

  // Classic until somebody asks for the overhauled page; the server already
  // read this browser's choice, so the first paint is the right one.
  const [layout, setLayout] = useState<WorkOrderLayout>(initialLayout)

  // The overhauled page edits the title in its header, outside the form, so
  // the page holds it and the form carries it as a hidden field. It follows
  // the record again after every save.
  const [title, setTitle] = useState(record.title)
  useEffect(() => {
    setTitle(record.title)
  }, [record.title])
  const modern = layout === 'modern'

  // One view per work order opened, in the layout it opened in; a switch on
  // the page is its own event and does not count as a second view. The
  // layout is also put on every later event from this browser, so any chart
  // (autocaptured clicks included) can be split by it.
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  useEffect(() => {
    registerAnalyticsProperties({ work_order_layout: layoutRef.current })
    track('work_order:page_view', { layout: layoutRef.current })
  }, [record.id])
  // The overhauled page has no tabs: photos, video, documents and status
  // reports are all on the job itself. A link to one of the old tabs lands on
  // the page with that section open or scrolled to.
  const isFileTab = storedTab === 'images' || storedTab === 'video' || storedTab === 'documents'
  const activeTab: ServiceTab = modern ? 'details' : storedTab
  // A link to this record with another tab (feedback on a status report, say)
  // changes only the query, so the page is not remounted and has to follow it.
  useEffect(() => {
    setActiveTab(resolvedInitialTab)
  }, [resolvedInitialTab])

  const handleTabChange = useCallback((tab: ServiceTab) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    if (tab === 'details') url.searchParams.delete('tab')
    else url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [])

  // Date check dialog state
  const [showDateCheck, setShowDateCheck] = useState(false)
  const dateCheckResolveRef = useRef<((proceed: boolean) => void) | null>(null)
  const today = new Date(new Date().toISOString().split('T')[0])
  const suggestedDueDate =
    defaultDueDays > 0 ? new Date(today.getTime() + defaultDueDays * 86400000) : today
  const [pendingInvoiceDate, setPendingInvoiceDate] = useState<Date>(today)
  const [pendingDueDate, setPendingDueDate] = useState<Date>(suggestedDueDate)
  const [updatingDates, setUpdatingDates] = useState(false)
  const [customizingDates, setCustomizingDates] = useState(false)

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const toISODate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

  const areDatesExpired = useMemo(() => {
    const invoiceDateStr = initialData.invoiceDate
    const dueDateStr = initialData.invoiceDueDate
    const todayStr = new Date().toISOString().split('T')[0]
    const invoiceExpired = invoiceDateStr ? invoiceDateStr < todayStr : false
    const dueExpired = dueDateStr ? dueDateStr < todayStr : false
    return invoiceExpired || dueExpired
  }, [initialData.invoiceDate, initialData.invoiceDueDate])

  const formState = useServiceFormState({
    vehicleId,
    initialData,
    defaultTaxRate,
    currentUserName,
    record,
    locked: lockState.locked,
    shopFee,
  })

  // Anything that happens to this job somewhere else: a technician billing
  // their time from the app, marking it complete in the bay, or the person at
  // the next desk saving it. Every write reaches here, because every write
  // announces itself (lib/realtime), rather than each feature having to
  // remember to. The page reads the job again and the form state decides what
  // to do with it: a status moves the bar at once, a line of work waits for
  // the banner below while somebody is typing.
  useLiveRecord('serviceRecord', record.id)

  const checkDates = useCallback(async () => {
    if (!areDatesExpired || formState.paymentStatus === 'paid') return true
    // Show current (expired) dates so user sees what's wrong
    setPendingInvoiceDate(
      initialData.invoiceDate ? new Date(initialData.invoiceDate + 'T00:00:00') : today
    )
    setPendingDueDate(
      initialData.invoiceDueDate ? new Date(initialData.invoiceDueDate + 'T00:00:00') : today
    )
    setShowDateCheck(true)
    return new Promise<boolean>((resolve) => {
      dateCheckResolveRef.current = resolve
    })
  }, [
    areDatesExpired,
    formState.paymentStatus,
    initialData.invoiceDate,
    initialData.invoiceDueDate,
  ])

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      const result = await lookupPartByBarcode(barcode)
      if (result.success && result.data) {
        const part = result.data
        // Same rule as the inventory picker — opt-in markup applies to
        // inventory parts too. Scanning a part must price it identically to
        // picking it, so both go through resolvePartPrice.
        const { unitPrice, markupPercent } = resolvePartPrice(part, {
          defaultMarkupPercent,
          markupAppliesToInventory,
        })
        formState.dirtySetPartItems((prev) => [
          {
            partNumber: part.partNumber || '',
            name: part.name,
            quantity: 1,
            unit: part.unit ?? null,
            unitPrice,
            total: lineTotal(1, unitPrice),
            unitCost: part.unitCost,
            markupPercent,
            inventoryPartId: part.id,
          },
          ...prev,
        ])
        toast.success(t('parts.partFound', { name: part.name }))
      } else {
        toast.error(t('parts.partNotFound', { barcode }))
      }
    },
    [formState, t, defaultMarkupPercent, markupAppliesToInventory]
  )

  useHardwareScanner({ onScan: handleBarcodeScan, enabled: activeTab === 'details' })

  // Notify customer
  const statusTemplateKeys: Record<string, string> = {
    'in-progress': SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
    'waiting-parts': SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
    completed: SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
  }
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [showWorkOrderPreview, setShowWorkOrderPreview] = useState(false)
  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [notifyMessage, setNotifyMessage] = useState('')

  const handleNotifyCustomer = useCallback(async () => {
    if (!customer) return
    const templateKey =
      statusTemplateKeys[formState.status] || SETTING_KEYS.SMS_TEMPLATE_STATUS_READY
    const tplResult = await getSmsTemplates()
    const tplData = tplResult.success && tplResult.data ? tplResult.data : null
    const tpl = tplData?.templates[templateKey] || SMS_TEMPLATE_DEFAULTS[templateKey] || ''
    const vehicle = record.vehicle
      ? `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`
      : record.title
    const message = interpolateSmsTemplate(tpl, {
      customer_name: customer.name,
      vehicle,
      company_name: tplData?.companyName || '',
      current_user: tplData?.currentUser || '',
    })
    setNotifyMessage(message)
    setShowNotifyDialog(true)
  }, [formState.status, customer, record.vehicle, record.title]) // eslint-disable-line react-hooks/exhaustive-deps

  // One of the workshop's own statuses asked for the customer to be told. The
  // message is the status's own, or a plain one naming it; either way it opens
  // in the dialog to be read and changed before anything is sent.
  const handleNotifyForStatus = useCallback(
    async (option: WorkOrderStatusOption) => {
      if (!customer) return
      const tplResult = await getSmsTemplates()
      const tplData = tplResult.success && tplResult.data ? tplResult.data : null
      const vehicle = record.vehicle
        ? `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`
        : record.title
      const message = interpolateSmsTemplate(
        // Read raw: the text carries {tokens} of its own, which are filled in
        // below and are not message arguments.
        option.messageTemplate?.trim() ||
          String(t.raw('customStatus.defaultMessage')).replace('{status}', option.name),
        {
          customer_name: customer.name,
          vehicle,
          company_name: tplData?.companyName || '',
          current_user: tplData?.currentUser || '',
        }
      )
      setNotifyMessage(message)
      setShowNotifyDialog(true)
    },
    [customer, record.vehicle, record.title, t]
  )

  // Observations state
  const tf = useTranslations('vehicles.findings')
  const [addingObservations, setAddingObservations] = useState(false)
  const otherObsCount = openObservations.filter((o) => o.serviceRecordId !== record.id).length
  const obsControlsRef = useRef<ObservationsControls | null>(null)

  const handleAddObservationsToWorkOrder = async (selectedIds: string[]) => {
    const selected = openObservations.filter((o) => selectedIds.includes(o.id))
    if (selected.length === 0) return
    setAddingObservations(true)
    const newItems = selected.map((o) => ({
      description: `${o.description}${o.notes ? ` - ${o.notes}` : ''}`,
      hours: 0,
      rate: 0,
      total: 0,
      pricingType: 'hourly' as const,
    }))
    formState.dirtySetLaborItems((prev) => [...newItems, ...prev])
    // Delete the observations that were added to the work order
    await Promise.all(selected.map((o) => deleteFinding(o.id)))
    setAddingObservations(false)
    toast.success(tf('observationsAdded', { count: selected.length }))
    router.refresh()
  }

  const handleSelectPreset = (preset: LaborPresetOption) => {
    const newItems = preset.items.map((item) => ({
      description: item.description,
      hours: item.hours,
      rate: item.rate > 0 ? item.rate : item.pricingType === 'service' ? 0 : defaultLaborRate,
      total:
        item.hours *
        (item.rate > 0 ? item.rate : item.pricingType === 'service' ? 0 : defaultLaborRate),
      pricingType: (item.pricingType as 'hourly' | 'service') || 'hourly',
    }))
    formState.dirtySetLaborItems((prev) => [...newItems, ...prev])

    if (preset.parts?.length) {
      const newParts = preset.parts.map((part) => ({
        name: part.name,
        partNumber: part.partNumber || '',
        quantity: part.quantity,
        unit: part.unit ?? null,
        unitPrice: part.unitPrice,
        total: lineTotal(part.quantity, part.unitPrice),
        unitCost: 0,
        markupPercent: 0,
        inventoryPartId: part.inventoryPartId || '',
      }))
      formState.dirtySetPartItems((prev) => [...newParts, ...prev])
    }
  }

  const actions = useServiceActions({
    record,
    vehicleId,
    currencyCode,
    formState,
  })

  const confirmComplete = useConfirm()

  /**
   * Run after the invoice has gone to the customer, by email or by link.
   *
   * Sending is what the "lock when sent" rule keys off, so the page is
   * re-rendered to pick up the lock rather than leaving the banner to appear
   * on the next reload. It is also the moment a job is in practice finished,
   * and an invoice that locks while still marked pending leaves the work board
   * showing work nobody is doing. The status is not changed silently, since
   * plenty of shops invoice up front.
   */
  const handleInvoiceSent = useCallback(async () => {
    router.refresh()
    if (formState.status === 'completed') return

    const ok = await confirmComplete({
      title: t('invoice.markCompletedTitle'),
      description: t('invoice.markCompletedDescription'),
      confirmLabel: t('invoice.markCompletedConfirm'),
    })
    if (!ok) return

    const result = await updateServiceStatus(record.id, 'completed')
    if (result.success) {
      // Already persisted by updateServiceStatus, so this must not dirty the
      // form: the invoice may have locked on the same send.
      formState.setStatus('completed')
      router.refresh()
    }
  }, [router, confirmComplete, formState, record.id, t])

  // An issued invoice prints from the design it was frozen with. An owner or
  // admin can move it to another, which changes the look and nothing the
  // invoice says. Offered only while the sheet is actually frozen: a reopened
  // one already follows the live design, so there is nothing to change.
  const canChangeIssuedDesign = canUnlock && designPinnedAt !== null

  useSaveShortcut(() => {
    if (formState.hasUnsavedChanges) return actions.saveNow()
  })

  // Both layouts are the same form, but the plain inputs (title, invoice
  // number, mileage) are remounted by the switch and would come back showing
  // the saved value. So what has been typed is saved first.
  const switchLayout = useCallback(
    async (next: WorkOrderLayout, source: 'banner' | 'menu' | 'footer') => {
      // Which way people go, and from where, is what decides when the classic
      // page can be retired: a switch back is the signal that something is
      // missing from the new one.
      track('work_order:layout_switch', {
        from_layout: next === 'modern' ? 'classic' : 'modern',
        to_layout: next,
        source,
      })
      registerAnalyticsProperties({ work_order_layout: next })
      if (formState.hasUnsavedChanges) await actions.saveNow()
      rememberWorkOrderLayout(next)
      setLayout(next)
    },
    [formState.hasUnsavedChanges, actions]
  )

  const previewInvoice = async () => {
    // No expired-dates prompt here: previewing is just looking, and the
    // check still runs on download, email, and share.
    if (formState.hasUnsavedChanges) await actions.saveNow()
    setShowPdfPreview(true)
  }

  const shareInvoice = async () => {
    if (!(await checkDates())) return
    if (formState.hasUnsavedChanges) await actions.saveNow()
    actions.setShowShareDialog(true)
  }

  // The classic page gives status reports a tab; the overhauled one has no
  // tabs and draws them as a section under the job. Same list either way.
  const statusReportList = (
    <StatusReportList
      serviceRecordId={record.id}
      organizationId={organizationId}
      vehicleName={formState.vehicleName}
      customer={
        customer
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              telegramChatId: customer.telegramChatId || null,
            }
          : null
      }
      smsEnabled={smsEnabled}
      emailEnabled={emailEnabled}
      telegramEnabled={telegramEnabled}
      initialReports={statusReports}
    />
  )

  // What can be done with the job as a whole. The classic header and the
  // overhauled page's own top carry the same cluster, fed from here.
  const headerActionProps = {
    meetingUrl: videoCall.link?.url ?? null,
    downloading: actions.downloading,
    saving: formState.loading,
    hasUnsavedChanges: formState.hasUnsavedChanges,
    showSaved: formState.showSaved,
    onDownloadPDF: async () => {
      if (!(await checkDates())) return
      if (formState.hasUnsavedChanges) await actions.saveNow()
      actions.handleDownloadPDF()
    },
    onPreviewPDF: previewInvoice,
    // The sheet says the job as it stands, so what has been typed goes in first.
    onPrintWorkOrder: async () => {
      if (formState.hasUnsavedChanges) await actions.saveNow()
      setShowWorkOrderPreview(true)
    },
    onDelete: actions.handleDelete,
    onShowEmail: async () => {
      if (!(await checkDates())) return
      if (formState.hasUnsavedChanges) await actions.saveNow()
      actions.setShowEmailDialog(true)
    },
    onShowShare: shareInvoice,
    onNotifyCustomer: handleNotifyCustomer,
    hasCustomer: !!customer,
    designMenu: canChangeIssuedDesign ? (
      <InvoiceDesignMenu recordId={record.id} designFollowsName={designFollowsName} />
    ) : undefined,
    layout,
    onSwitchLayout: () => void switchLayout(modern ? 'classic' : 'modern', 'menu'),
  }

  // One set of props for each column, handed to whichever layout is showing:
  // the classic two columns take them as they are, the overhauled page takes
  // both and lays the same sections out its own way.
  // The invoice's link as a code for the customer at the desk. One element,
  // drawn wherever a payment is taken: beside "Record payment" on both
  // layouts, and on the overhauled page's money bar.
  const payCode = onlinePayments ? (
    <PayCodeButton
      serviceRecordId={record.id}
      organizationId={organizationId}
      publicToken={record.publicToken ?? null}
      balance={formState.balanceDue}
      currencyCode={currencyCode}
    />
  ) : null

  const leftColumnProps: ComponentProps<typeof DetailsLeftColumn> = {
    formState,
    actions,
    record,
    tireSet: record.tireSet ?? null,
    tireHotelEnabled,
    tireThresholds,
    unitSystem,
    currencyCode,
    defaultLaborRate,
    inventoryParts,
    defaultMarkupPercent,
    markupAppliesToInventory,
    hasPresets: laborPresets.length > 0,
    onOpenPresets: () => formState.setShowPresetPicker(true),
    onScanBarcode: () => formState.setShowBarcodeScanner(true),
    aiEnabled,
    vehicleId,
    findings,
    onAddFinding: () => obsControlsRef.current?.onAddFinding(),
    onEditFinding: (f) => obsControlsRef.current?.onEditFinding(f),
    openObservationsCount: otherObsCount,
    onShowExistingObservations: () => obsControlsRef.current?.onShowExistingObservations(),
    jobClock,
    locked: lockState.locked,
    payCode,
  }

  const rightColumnProps: ComponentProps<typeof DetailsRightColumn> = {
    videoCall,
    smsEnabled,
    emailEnabled,
    telegramEnabled,
    formState,
    actions,
    record,
    vehicleId,
    organizationId,
    currencyCode,
    unitSystem,
    warrantyTexts,
    taxEnabled,
    initialVehicle,
    boardTechnicians,
    workBays,
    orgMembers,
    notificationHistory,
    designOptions,
    designFollowsName,
    designFollowsRule,
  }

  return (
    <ShopFeeProvider value={shopFee}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {modern ? (
          <ModernHero
            record={record}
            status={formState.status}
            paymentStatus={formState.paymentStatus}
            warranty={formState.warranty}
            actions={
              <>
                <PresenceChips kind="serviceRecord" id={record.id} className="mr-1" />
                <ServiceHeaderActions showSave {...headerActionProps} />
              </>
            }
            title={title}
            onTitleChange={(next) => {
              setTitle(next)
              // Saved the moment the field is left, on its own, not with the
              // form's autosave five seconds later: a rename followed by the
              // back arrow inside those seconds was lost. Only a refused save
              // marks the form dirty, so the ordinary path can try again.
              void updateServiceRecordTitle(record.id, next).then((result) => {
                if (result.success) {
                  formState.flashSaved()
                } else {
                  toast.error(result.error || t('page.failedUpdate'))
                  formState.markDirty()
                }
              })
            }}
            type={record.vehicle ? formState.type : undefined}
            onTypeChange={formState.dirtySetType}
            locked={lockState.locked}
          />
        ) : (
          <UnifiedServiceHeader
            presence={<PresenceChips kind="serviceRecord" id={record.id} />}
            vehicleId={vehicleId}
            vehicleName={formState.vehicleName}
            title={record.title}
            status={formState.status}
            paymentStatus={formState.paymentStatus}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabCounts={{
              images: imageAttachmentsForManager.length,
              video: videoAttachments.length,
              documents: documentAttachments.length,
              statusReports: statusReports.length,
            }}
            {...headerActionProps}
          />
        )}

        {!modern && <TryNewLayoutBanner onTry={() => void switchLayout('modern', 'banner')} />}

        <LaborAddedBanner
          count={formState.laborAddedElsewhere.length}
          onShow={formState.applyLaborAddedElsewhere}
        />

        {(lockState.locked || lockState.unlockedAt) && (
          <div className="shrink-0 px-4 pt-3">
            <DocumentLockBanner
              state={lockState}
              kind="invoice"
              canUnlock={canUnlock}
              onSetUnlocked={(unlocked) => setInvoiceEditUnlocked(record.id, unlocked)}
            />
          </div>
        )}

        {activeTab === 'details' && (
          <WorkOrderLayoutProvider value={layout}>
            {modern ? (
              <ModernDetails
                {...leftColumnProps}
                {...rightColumnProps}
                workOrderStatuses={workOrderStatuses}
                onNotifyForStatus={handleNotifyForStatus}
                locked={lockState.locked}
                lockedLabel={t('invoice.lockedFieldsetLabel')}
                form={{
                  id: 'service-record-form',
                  ref: formState.formRef,
                  onSubmit: actions.handleSubmit,
                  onInput: formState.markDirty,
                }}
                files={{
                  images: imageAttachmentsForManager,
                  dropoff: dropoffAttachments,
                  videos: videoAttachments,
                  documents: documentAttachments,
                  maxImages: maxImagesPerService,
                  maxDiagnostics: maxDiagnosticsPerService,
                  maxDocuments: maxDocumentsPerService,
                  // A link to one of the classic tabs opens that tab here.
                  initialTab: isFileTab || storedTab === 'statusReports' ? storedTab : undefined,
                  statusReports: { count: statusReports.length, list: statusReportList },
                }}
                onPreviewInvoice={previewInvoice}
                onSendToCustomer={shareInvoice}
                onBackToClassic={() => void switchLayout('classic', 'footer')}
                title={title}
                aiTranscription={aiTranscription}
                dictationMode={dictationMode}
                onAddFindingForConcern={(concernId) =>
                  obsControlsRef.current?.onAddFinding(concernId)
                }
                scrollToFiles={isFileTab || storedTab === 'statusReports'}
              />
            ) : (
              // noValidate, and the rules checked in handleSubmit instead. An
              // autosave submits through requestSubmit, which native validation
              // stops with no message and no request; and the rules that matter
              // most here — a priced part with no name, labour with hours and no
              // description — are not ones a `required` attribute can state.
              <form
                id="service-record-form"
                ref={formState.formRef}
                onSubmit={actions.handleSubmit}
                onInput={formState.markDirty}
                className="flex min-h-0 flex-1 flex-col"
                noValidate
              >
                {/* A locked invoice offers no editing at all, rather than letting
                  someone retype a line and meet the refusal on save. The
                  fieldset disables every control inside it natively;
                  display:contents keeps the layout exactly as it was. */}
                <fieldset
                  disabled={lockState.locked}
                  className="contents"
                  aria-label={lockState.locked ? t('invoice.lockedFieldsetLabel') : undefined}
                >
                  <ServiceDetailContent
                    leftColumn={<DetailsLeftColumn {...leftColumnProps} />}
                    rightColumn={<DetailsRightColumn {...rightColumnProps} />}
                  />
                </fieldset>
              </form>
            )}
            {vehicleId && (
              <ObservationsManager
                vehicleId={vehicleId}
                serviceRecordId={record.id}
                openObservations={openObservations}
                onAddObservations={handleAddObservationsToWorkOrder}
                addingObservations={addingObservations}
                // Saved concerns only: a row still being typed has no id yet, so
                // there is nothing a finding could point at.
                concerns={formState.concerns.filter(
                  (c): c is { id: string; description: string; sortOrder: number } =>
                    Boolean(c.id) && Boolean(c.description.trim())
                )}
                onControlsReady={(c) => {
                  obsControlsRef.current = c
                }}
              />
            )}
          </WorkOrderLayoutProvider>
        )}

        {activeTab === 'images' && (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <ServiceImagesManager
              serviceRecordId={record.id}
              initialImages={imageAttachmentsForManager}
              maxImages={maxImagesPerService}
              customerId={customer?.id}
            />
          </div>
        )}

        {activeTab === 'video' && (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <ServiceVideoManager serviceRecordId={record.id} initialVideos={videoAttachments} />
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <ServiceDocumentsManager
              serviceRecordId={record.id}
              initialDocuments={documentAttachments}
              maxDiagnostics={maxDiagnosticsPerService}
              maxDocuments={maxDocumentsPerService}
            />
          </div>
        )}

        {activeTab === 'statusReports' && (
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">{statusReportList}</div>
        )}

        <InventoryPickerDialog
          open={formState.showInventoryPicker}
          onOpenChange={formState.setShowInventoryPicker}
          inventoryParts={inventoryParts}
          currencyCode={currencyCode}
          onSelectPart={(part) => formState.dirtySetPartItems((prev) => [part, ...prev])}
          defaultMarkupPercent={defaultMarkupPercent}
          markupAppliesToInventory={markupAppliesToInventory}
        />

        <LaborPresetPickerDialog
          open={formState.showPresetPicker}
          onOpenChange={formState.setShowPresetPicker}
          laborPresets={laborPresets}
          onSelectPreset={handleSelectPreset}
        />

        <BarcodeScannerDialog
          open={formState.showBarcodeScanner}
          onOpenChange={formState.setShowBarcodeScanner}
          onScan={handleBarcodeScan}
          title={t('parts.scanTitle')}
        />

        <ImageCarousel
          images={formState.imageAttachments}
          currentIndex={actions.carouselIndex}
          onClose={() => actions.setCarouselIndex(null)}
          onChangeIndex={actions.setCarouselIndex}
        />

        <PdfPreviewDialog
          open={showPdfPreview}
          onOpenChange={setShowPdfPreview}
          url={`/api/protected/services/${record.id}/pdf`}
        />

        <PdfPreviewDialog
          open={showWorkOrderPreview}
          onOpenChange={setShowWorkOrderPreview}
          url={`/api/protected/services/${record.id}/work-order-pdf`}
        />

        <SendEmailDialog
          open={actions.showEmailDialog}
          onOpenChange={actions.setShowEmailDialog}
          defaultEmail={customer?.email || ''}
          entityLabel={t('invoice.entityLabel')}
          onSend={async (email, message, attachPdf) => {
            const result = await sendInvoiceEmail({
              serviceRecordId: record.id,
              recipientEmail: email,
              message,
              attachPdf,
            })
            // Deliberately not awaited: the email dialog should show "sent" the
            // moment it is, not sit spinning behind the "mark completed"
            // confirmation that handleInvoiceSent may raise.
            if (result.success) void handleInvoiceSent()
            return result
          }}
        />

        <ShareDialog
          open={actions.showShareDialog}
          onOpenChange={actions.setShowShareDialog}
          recordId={record.id}
          organizationId={organizationId}
          initialToken={record.publicToken}
          onSent={handleInvoiceSent}
          customer={customer}
          smsEnabled={smsEnabled}
          emailEnabled={emailEnabled}
        />

        {customer && (
          <>
            <NotifyCustomerDialog
              open={actions.showPaymentNotifyDialog}
              onOpenChange={actions.setShowPaymentNotifyDialog}
              customer={customer}
              vehicle={record.vehicle}
              defaultMessage={actions.paymentNotifyMessage}
              emailSubject={t('invoice.emailSubject')}
              smsEnabled={smsEnabled}
              emailEnabled={emailEnabled}
              relatedEntityType="service-record"
              relatedEntityId={record.id}
            />
            <NotifyCustomerDialog
              open={showNotifyDialog}
              onOpenChange={setShowNotifyDialog}
              customer={customer}
              vehicle={record.vehicle}
              defaultMessage={notifyMessage}
              emailSubject={t('invoice.statusEmailSubject')}
              smsEnabled={smsEnabled}
              emailEnabled={emailEnabled}
              relatedEntityType="service-record"
              relatedEntityId={record.id}
            />
          </>
        )}

        {/* Expired dates check dialog */}
        <Dialog
          open={showDateCheck}
          onOpenChange={(open) => {
            if (!open) {
              dateCheckResolveRef.current?.(false)
              dateCheckResolveRef.current = null
              setCustomizingDates(false)
            }
            setShowDateCheck(open)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {t('page.datesExpiredTitle')}
              </DialogTitle>
              <DialogDescription>{t('page.datesExpiredDescription')}</DialogDescription>
            </DialogHeader>

            {!customizingDates ? (
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  disabled={updatingDates}
                  onClick={async () => {
                    if (updatingDates) return
                    const now = new Date(new Date().toISOString().split('T')[0])
                    const due =
                      defaultDueDays > 0
                        ? new Date(now.getTime() + defaultDueDays * 86400000)
                        : new Date(now.getTime() + 14 * 86400000)
                    setPendingInvoiceDate(now)
                    setPendingDueDate(due)
                    setUpdatingDates(true)
                    try {
                      await updateServiceRecord({
                        id: record.id,
                        invoiceDate: toISODate(now),
                        invoiceDueDate: toISODate(due),
                      })
                      setShowDateCheck(false)
                      dateCheckResolveRef.current?.(true)
                      dateCheckResolveRef.current = null
                      router.refresh()
                    } finally {
                      setUpdatingDates(false)
                    }
                  }}
                >
                  {updatingDates && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('page.datesExpiredUseToday')}
                </Button>
                <Button
                  variant="outline"
                  disabled={updatingDates}
                  onClick={() => {
                    setShowDateCheck(false)
                    dateCheckResolveRef.current?.(true)
                    dateCheckResolveRef.current = null
                  }}
                >
                  {t('page.datesExpiredProceed')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={updatingDates}
                  onClick={() => setCustomizingDates(true)}
                >
                  {t('page.datesExpiredCustomize')}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('basicInfo.invoiceDate')}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-9 text-sm"
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          <span suppressHydrationWarning>{formatDate(pendingInvoiceDate)}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={pendingInvoiceDate}
                          onSelect={(d) => d && setPendingInvoiceDate(d)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t('basicInfo.invoiceDueDate')}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal h-9 text-sm"
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          <span suppressHydrationWarning>{formatDate(pendingDueDate)}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={pendingDueDate}
                          onSelect={(d) => d && setPendingDueDate(d)}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    disabled={updatingDates}
                    onClick={async () => {
                      if (updatingDates) return
                      setUpdatingDates(true)
                      try {
                        await updateServiceRecord({
                          id: record.id,
                          invoiceDate: toISODate(pendingInvoiceDate),
                          invoiceDueDate: toISODate(pendingDueDate),
                        })
                        setShowDateCheck(false)
                        setCustomizingDates(false)
                        dateCheckResolveRef.current?.(true)
                        dateCheckResolveRef.current = null
                        router.refresh()
                      } finally {
                        setUpdatingDates(false)
                      }
                    }}
                  >
                    {updatingDates && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('page.datesExpiredUpdate')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={updatingDates}
                    onClick={() => setCustomizingDates(false)}
                  >
                    {t('page.datesExpiredBack')}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ShopFeeProvider>
  )
}
