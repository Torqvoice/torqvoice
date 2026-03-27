'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendInvoiceEmail } from '@/features/email/Actions/emailActions'
import { SendEmailDialog } from '@/features/email/Components/SendEmailDialog'
import { useTranslations } from 'next-intl'

import { ServiceDetailContent } from '../service-detail/ServiceDetailContent'
import { ImageCarousel } from '../service-detail/ImageCarousel'
import { ShareDialog } from '../service-detail/ShareDialog'
import { NotifyCustomerDialog } from '@/components/notify-customer-dialog'
import { InventoryPickerDialog } from '../service-edit/InventoryPickerDialog'
import { BarcodeScannerDialog } from '@/components/barcode-scanner-dialog'
import { useHardwareScanner } from '@/hooks/use-hardware-scanner'
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
import { CalendarIcon, AlertTriangle } from 'lucide-react'
import { updateServiceRecord } from '@/features/vehicles/Actions/serviceActions'
import { LaborPresetPickerDialog } from '@/features/labor-presets/Components/LaborPresetPickerDialog'
import type { LaborPresetOption } from './service-page-types'
import { ServiceImagesManager } from '../service-images-manager'
import { ServiceVideoManager } from '../service-video-manager'
import { ServiceDocumentsManager } from '../service-documents-manager'
import { StatusReportList } from '@/features/status-reports/Components/StatusReportList'
import { UnifiedServiceHeader, type ServiceTab } from './UnifiedServiceHeader'

import { useServiceFormState } from './useServiceFormState'
import { useServiceActions } from './useServiceActions'
import { DetailsLeftColumn } from './DetailsLeftColumn'
import { DetailsRightColumn } from './DetailsRightColumn'

export type { ServicePageClientProps, BoardTechnicianOption } from './service-page-types'
import type { ServicePageClientProps } from './service-page-types'

export function ServicePageClient({
  record,
  vehicleId,
  organizationId,
  currencyCode,
  unitSystem,
  defaultTaxRate,
  taxEnabled,
  defaultLaborRate,
  initialData,
  inventoryParts,
  initialVehicle,
  boardTechnicians = [],
  orgMembers = [],
  currentUserName,
  imageAttachmentsForManager,
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
  defaultDueDays = 0,
  statusReports = [],
  initialTab,
}: ServicePageClientProps) {
  const t = useTranslations('service')
  const router = useRouter()

  const validTabs: ServiceTab[] = ['details', 'images', 'video', 'documents', 'statusReports']
  const resolvedInitialTab = initialTab && validTabs.includes(initialTab as ServiceTab) ? (initialTab as ServiceTab) : 'details'

  const [activeTab, setActiveTab] = useState<ServiceTab>(resolvedInitialTab)

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
  const suggestedDueDate = defaultDueDays > 0 ? new Date(today.getTime() + defaultDueDays * 86400000) : today
  const [pendingInvoiceDate, setPendingInvoiceDate] = useState<Date>(today)
  const [pendingDueDate, setPendingDueDate] = useState<Date>(suggestedDueDate)
  const [updatingDates, setUpdatingDates] = useState(false)

  const formatDate = (date: Date) => date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const toISODate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

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
  })

  const checkDates = useCallback(async () => {
    if (!areDatesExpired || formState.paymentStatus === 'paid') return true
    // Show current (expired) dates so user sees what's wrong
    setPendingInvoiceDate(initialData.invoiceDate ? new Date(initialData.invoiceDate + 'T00:00:00') : today)
    setPendingDueDate(initialData.invoiceDueDate ? new Date(initialData.invoiceDueDate + 'T00:00:00') : today)
    setShowDateCheck(true)
    return new Promise<boolean>((resolve) => {
      dateCheckResolveRef.current = resolve
    })
  }, [areDatesExpired, formState.paymentStatus, initialData.invoiceDate, initialData.invoiceDueDate])

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const result = await lookupPartByBarcode(barcode)
    if (result.success && result.data) {
      const part = result.data
      const price = part.sellPrice > 0 ? part.sellPrice : part.unitCost
      formState.dirtySetPartItems((prev) => [...prev, {
        partNumber: part.partNumber || '',
        name: part.name,
        quantity: 1,
        unitPrice: price,
        total: price,
        unitCost: part.unitCost,
        inventoryPartId: part.id,
      }])
      toast.success(t('parts.partFound', { name: part.name }))
    } else {
      toast.error(t('parts.partNotFound', { barcode }))
    }
  }, [formState, t])

  useHardwareScanner({ onScan: handleBarcodeScan, enabled: activeTab === 'details' })

  const handleSelectPreset = (preset: LaborPresetOption) => {
    const newItems = preset.items.map((item) => ({
      description: item.description,
      hours: item.hours,
      rate: item.rate > 0 ? item.rate : (item.pricingType === 'service' ? 0 : defaultLaborRate),
      total: item.hours * (item.rate > 0 ? item.rate : (item.pricingType === 'service' ? 0 : defaultLaborRate)),
      pricingType: (item.pricingType as 'hourly' | 'service') || 'hourly',
    }))
    formState.dirtySetLaborItems((prev) => [...prev, ...newItems])
  }

  const actions = useServiceActions({
    record,
    vehicleId,
    currencyCode,
    formState,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <UnifiedServiceHeader
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
        downloading={actions.downloading}
        saving={formState.loading}
        hasUnsavedChanges={formState.hasUnsavedChanges}
        showSaved={formState.showSaved}
        onDownloadPDF={async () => { if (!await checkDates()) return; if (formState.hasUnsavedChanges) await actions.saveNow(); actions.handleDownloadPDF() }}
        onDelete={actions.handleDelete}
        onShowEmail={async () => { if (!await checkDates()) return; if (formState.hasUnsavedChanges) await actions.saveNow(); actions.setShowEmailDialog(true) }}
        onShowShare={async () => { if (!await checkDates()) return; if (formState.hasUnsavedChanges) await actions.saveNow(); actions.setShowShareDialog(true) }}
      />

      {activeTab === 'details' && (
        <form id="service-record-form" ref={formState.formRef} onSubmit={actions.handleSubmit} onInput={formState.markDirty} className="flex min-h-0 flex-1 flex-col">
          <ServiceDetailContent
            leftColumn={
              <DetailsLeftColumn
                formState={formState}
                actions={actions}
                record={record}
                currencyCode={currencyCode}
                defaultLaborRate={defaultLaborRate}
                inventoryParts={inventoryParts}
                hasPresets={laborPresets.length > 0}
                onOpenPresets={() => formState.setShowPresetPicker(true)}
                onScanBarcode={() => formState.setShowBarcodeScanner(true)}
                aiEnabled={aiEnabled}
              />
            }
            rightColumn={
              <DetailsRightColumn
                formState={formState}
                actions={actions}
                record={record}
                vehicleId={vehicleId}
                organizationId={organizationId}
                currencyCode={currencyCode}
                taxEnabled={taxEnabled}
                initialVehicle={initialVehicle}
                boardTechnicians={boardTechnicians}
                orgMembers={orgMembers}
              />
            }
          />
        </form>
      )}

      {activeTab === 'images' && (
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          <ServiceImagesManager
            serviceRecordId={record.id}
            initialImages={imageAttachmentsForManager}
            maxImages={maxImagesPerService}
          />
        </div>
      )}

      {activeTab === 'video' && (
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          <ServiceVideoManager
            serviceRecordId={record.id}
            initialVideos={videoAttachments}
          />
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          <StatusReportList
            serviceRecordId={record.id}
            organizationId={organizationId}
            vehicleName={formState.vehicleName}
            customer={record.vehicle.customer ? {
              id: record.vehicle.customer.id,
              name: record.vehicle.customer.name,
              email: record.vehicle.customer.email,
              phone: record.vehicle.customer.phone,
              telegramChatId: record.vehicle.customer.telegramChatId || null,
            } : null}
            smsEnabled={smsEnabled}
            emailEnabled={emailEnabled}
            telegramEnabled={telegramEnabled}
            initialReports={statusReports}
          />
        </div>
      )}

      <InventoryPickerDialog
        open={formState.showInventoryPicker}
        onOpenChange={formState.setShowInventoryPicker}
        inventoryParts={inventoryParts}
        currencyCode={currencyCode}
        onSelectPart={(part) => formState.dirtySetPartItems((prev) => [...prev, part])}
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

      <SendEmailDialog
        open={actions.showEmailDialog}
        onOpenChange={actions.setShowEmailDialog}
        defaultEmail={record.vehicle.customer?.email || ''}
        entityLabel={t('invoice.entityLabel')}
        onSend={async (email, message) =>
          sendInvoiceEmail({ serviceRecordId: record.id, recipientEmail: email, message })
        }
      />

      <ShareDialog
        open={actions.showShareDialog}
        onOpenChange={actions.setShowShareDialog}
        recordId={record.id}
        organizationId={organizationId}
        initialToken={record.publicToken}
        customer={record.vehicle.customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
      />

      {record.vehicle.customer && (
        <NotifyCustomerDialog
          open={actions.showPaymentNotifyDialog}
          onOpenChange={actions.setShowPaymentNotifyDialog}
          customer={record.vehicle.customer}
          defaultMessage={actions.paymentNotifyMessage}
          emailSubject={t('invoice.emailSubject')}
          smsEnabled={smsEnabled}
          emailEnabled={emailEnabled}
          relatedEntityType="service-record"
          relatedEntityId={record.id}
        />
      )}

      {/* Expired dates check dialog */}
      <Dialog open={showDateCheck} onOpenChange={(open) => {
        if (!open) {
          dateCheckResolveRef.current?.(false)
          dateCheckResolveRef.current = null
        }
        setShowDateCheck(open)
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('page.datesExpiredTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('page.datesExpiredDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                const now = new Date(new Date().toISOString().split('T')[0])
                setPendingInvoiceDate(now)
                setPendingDueDate(defaultDueDays > 0 ? new Date(now.getTime() + defaultDueDays * 86400000) : new Date(now.getTime() + 14 * 86400000))
              }}
            >
              {t('page.datesExpiredSetToday')}
            </Button>

            <div className="space-y-1">
              <Label className="text-xs">{t('basicInfo.invoiceDate')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    <span suppressHydrationWarning>{formatDate(pendingInvoiceDate)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={pendingInvoiceDate} onSelect={(d) => d && setPendingInvoiceDate(d)} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('basicInfo.invoiceDueDate')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    <span suppressHydrationWarning>{formatDate(pendingDueDate)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={pendingDueDate} onSelect={(d) => d && setPendingDueDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              disabled={updatingDates}
              onClick={async () => {
                setUpdatingDates(true)
                await updateServiceRecord({
                  id: record.id,
                  invoiceDate: toISODate(pendingInvoiceDate),
                  invoiceDueDate: toISODate(pendingDueDate),
                })
                setUpdatingDates(false)
                setShowDateCheck(false)
                dateCheckResolveRef.current?.(true)
                dateCheckResolveRef.current = null
                router.refresh()
              }}
            >
              {t('page.datesExpiredUpdate')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowDateCheck(false)
                dateCheckResolveRef.current?.(true)
                dateCheckResolveRef.current = null
              }}
            >
              {t('page.datesExpiredProceed')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
