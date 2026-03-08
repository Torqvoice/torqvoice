'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { updateServiceRecord, deleteServiceRecord, deleteServiceAttachment, toggleManuallyPaid, revokePublicLink } from '@/features/vehicles/Actions/serviceActions'
import { createPayment, deletePayment } from '@/features/payments/Actions/paymentActions'
import { sendInvoiceEmail } from '@/features/email/Actions/emailActions'
import { SendEmailDialog } from '@/features/email/Components/SendEmailDialog'
import type { ServicePartInput, ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import type { ServiceDetail } from '../service-detail/types'
import type { InitialData, InventoryPartOption, VehicleOption } from '../service-edit/form-types'
export interface BoardTechnicianOption {
  id: string
  name: string
}

import { ServiceDetailContent } from '../service-detail/ServiceDetailContent'
import { InvoiceSummary } from '../service-detail/InvoiceSummary'
import { PaymentsSection } from '../service-detail/PaymentsSection'
import { ServiceAttachments } from '../service-detail/ServiceAttachments'
import { ImageCarousel } from '../service-detail/ImageCarousel'
import { ShareDialog } from '../service-detail/ShareDialog'
import { NotifyCustomerDialog } from '@/components/notify-customer-dialog'
import { formatCurrency } from '@/lib/format'
import { getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'

import { BasicInfoSection } from '../service-edit/BasicInfoSection'
import { ScheduleTimesSection } from '../service-edit/ScheduleTimesSection'
import { PartsEditor } from '../service-edit/PartsEditor'
import { LaborEditor } from '../service-edit/LaborEditor'
import { TotalsSection } from '../service-edit/TotalsSection'
import { NotesSection } from '../service-edit/NotesSection'
import { InventoryPickerDialog } from '../service-edit/InventoryPickerDialog'

import { ServiceImagesManager } from '../service-images-manager'
import { ServiceVideoManager } from '../service-video-manager'
import { ServiceDocumentsManager } from '../service-documents-manager'

import { UnifiedServiceHeader, type ServiceTab } from './UnifiedServiceHeader'
import { SharedLinkCard } from '@/components/shared-link-card'
import { useTranslations } from 'next-intl'

interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  category: string
  description: string | null
  includeInInvoice: boolean
  createdAt: Date
}

export interface ServicePageClientProps {
  record: ServiceDetail
  vehicleId: string
  organizationId: string
  currencyCode: string
  unitSystem: 'metric' | 'imperial'
  defaultTaxRate: number
  taxEnabled: boolean
  defaultLaborRate: number
  initialData: InitialData
  inventoryParts: InventoryPartOption[]
  vehicles: VehicleOption[]
  boardTechnicians?: BoardTechnicianOption[]
  currentUserName: string
  // Media data
  imageAttachmentsForManager: Attachment[]
  videoAttachments: Attachment[]
  documentAttachments: Attachment[]
  maxImagesPerService: number
  maxDiagnosticsPerService: number
  maxDocumentsPerService: number
  smsEnabled?: boolean
  emailEnabled?: boolean
}

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
  vehicles,
  boardTechnicians = [],
  currentUserName,
  imageAttachmentsForManager,
  videoAttachments,
  documentAttachments,
  maxImagesPerService,
  maxDiagnosticsPerService,
  maxDocumentsPerService,
  smsEnabled = false,
  emailEnabled = false,
}: ServicePageClientProps) {
  const router = useRouter()
  const modal = useGlassModal()
  const confirm = useConfirm()
  const t = useTranslations('service')
  const tc = useTranslations('common')
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'

  // Tab state
  const [activeTab, setActiveTab] = useState<ServiceTab>('details')

  // Form state (from ServiceRecordForm)
  const [loading, setLoading] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleId)
  const [vehicleOpen, setVehicleOpen] = useState(false)
  const [techName] = useState(initialData.techName || currentUserName)
  const [type, setType] = useState(initialData.type || 'maintenance')
  const [status, setStatus] = useState(initialData.status || 'completed')
  const [partItems, setPartItems] = useState<ServicePartInput[]>(initialData.partItems || [])
  const [laborItems, setLaborItems] = useState<ServiceLaborInput[]>(initialData.laborItems || [])
  const [taxRate, setTaxRate] = useState(initialData.taxRate ?? defaultTaxRate)
  const [discountType, setDiscountType] = useState<string>(initialData.discountType || 'none')
  const [discountValue, setDiscountValue] = useState(initialData.discountValue ?? 0)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false)
  // Detail-page state
  const [downloading, setDownloading] = useState(false)
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null)
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [showPaymentNotifyDialog, setShowPaymentNotifyDialog] = useState(false)
  const [paymentNotifyMessage, setPaymentNotifyMessage] = useState('')

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
  const taxAmount = (subtotal - discountAmount) * (taxRate / 100)
  const totalAmount = subtotal - discountAmount + taxAmount

  const displayTotal = totalAmount > 0 ? totalAmount : record.cost
  const paidFromPayments = record.payments?.reduce((sum, p) => sum + p.amount, 0) || 0
  const totalPaid = record.manuallyPaid ? displayTotal : paidFromPayments
  const balanceDue = displayTotal - totalPaid
  const paymentStatus = record.manuallyPaid
    ? 'paid'
    : totalPaid === 0
      ? 'unpaid'
      : balanceDue <= 0
        ? 'paid'
        : 'partial'
  const imageAttachments = record.attachments?.filter((a) => a.category === 'image') || []
  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`

  // Part/labor update helpers
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

  // Form submit
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSavingRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    isSavingRef.current = true
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
      setHasUnsavedChanges(false)
      flashSaved()
      if (selectedVehicleId !== vehicleId) {
        router.push(`/vehicles/${selectedVehicleId}/service/${initialData.id}`)
      } else {
        router.refresh()
      }
    } else {
      modal.open('error', tc('errors.error'), result.error || t('page.failedUpdate'))
    }

    isSavingRef.current = false
    setLoading(false)
  }

  // Detail actions
  const handleDelete = async () => {
    const ok = await confirm({
      title: t('page.deleteTitle'),
      description: t('page.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteServiceRecord(record.id)
    if (result.success) {
      router.push(`/vehicles/${vehicleId}`)
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('page.failedDelete'))
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/protected/services/${record.id}/pdf`)
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        `invoice-${record.invoiceNumber || record.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      modal.open('error', tc('errors.error'), t('payments.failedPdf'))
    }
    setDownloading(false)
  }

  const handleDeleteAttachment = async (id: string) => {
    const ok = await confirm({
      title: t('attachments.deleteTitle'),
      description: t('attachments.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    setDeletingAttachment(id)
    const result = await deleteServiceAttachment(id)
    if (result.success) {
      toast.success(t('attachments.deleted'))
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('attachments.failedDelete'))
    }
    setDeletingAttachment(null)
  }

  const handleCreatePayment = async (data: {
    amount: number
    date: string
    method: string
    note?: string
  }) => {
    setPaymentLoading(true)
    const result = await createPayment({ serviceRecordId: record.id, ...data })
    setPaymentLoading(false)
    if (result.success) {
      toast.success(t('payments.recorded'))
      router.refresh()
      if (record.vehicle.customer) {
        const invoiceNum = record.invoiceNumber || `#${record.id.slice(-8).toUpperCase()}`
        const tplResult = await getSmsTemplates()
        const tplData = tplResult.success && tplResult.data ? tplResult.data : null
        const tpl = tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] || SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] || ''
        setPaymentNotifyMessage(
          interpolateSmsTemplate(tpl, {
            amount: formatCurrency(data.amount, currencyCode),
            invoice_number: invoiceNum,
            customer_name: record.vehicle.customer.name,
            company_name: tplData?.companyName || '',
            current_user: tplData?.currentUser || '',
          })
        )
        setShowPaymentNotifyDialog(true)
      }
      return true
    }
    modal.open('error', tc('errors.error'), result.error || t('payments.failedRecord'))
    return false
  }

  const handleTogglePaid = async () => {
    setPaymentLoading(true)
    const result = await toggleManuallyPaid(record.id)
    setPaymentLoading(false)
    if (result.success) {
      toast.success(result.data?.manuallyPaid ? t('payments.markedPaid') : t('payments.markedUnpaid'))
      router.refresh()
      if (result.data?.manuallyPaid && record.vehicle.customer) {
        const invoiceNum = record.invoiceNumber || `#${record.id.slice(-8).toUpperCase()}`
        const tplResult = await getSmsTemplates()
        const tplData = tplResult.success && tplResult.data ? tplResult.data : null
        const tpl = tplData?.templates[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] || SMS_TEMPLATE_DEFAULTS[SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED] || ''
        setPaymentNotifyMessage(
          interpolateSmsTemplate(tpl, {
            amount: '',
            invoice_number: invoiceNum,
            customer_name: record.vehicle.customer.name,
            company_name: tplData?.companyName || '',
            current_user: tplData?.currentUser || '',
          })
        )
        setShowPaymentNotifyDialog(true)
      }
    } else {
      modal.open('error', tc('errors.error'), result.error || t('payments.failedStatus'))
    }
  }

  const handleDeletePayment = async (id: string) => {
    const ok = await confirm({
      title: t('payments.deleteTitle'),
      description: t('payments.deleteDescription'),
      confirmLabel: tc('buttons.delete'),
      destructive: true,
    })
    if (!ok) return
    setDeletingPayment(id)
    const result = await deletePayment(id)
    if (result.success) {
      toast.success(t('payments.deleted'))
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result.error || t('payments.failedDelete'))
    }
    setDeletingPayment(null)
  }

  // Details tab content
  const detailsLeftColumn = (
    <div className="space-y-3">
      <PartsEditor
        partItems={partItems}
        setPartItems={dirtySetPartItems}
        updatePart={updatePart}
        partsSubtotal={partsSubtotal}
        currencyCode={currencyCode}
        hasInventory={inventoryParts.length > 0}
        onOpenInventory={() => setShowInventoryPicker(true)}
      />
      <LaborEditor
        laborItems={laborItems}
        setLaborItems={dirtySetLaborItems}
        updateLabor={updateLabor}
        laborSubtotal={laborSubtotal}
        currencyCode={currencyCode}
        defaultLaborRate={defaultLaborRate}
      />
      <NotesSection initialData={initialData} onNotesChange={handleNotesChange} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PaymentsSection
          payments={record.payments || []}
          paymentStatus={paymentStatus}
          manuallyPaid={record.manuallyPaid}
          totalPaid={totalPaid}
          displayTotal={displayTotal}
          balanceDue={balanceDue}
          currencyCode={currencyCode}
          onCreatePayment={handleCreatePayment}
          onDeletePayment={handleDeletePayment}
          onTogglePaid={handleTogglePaid}
          paymentLoading={paymentLoading}
          deletingPayment={deletingPayment}
        />
        <InvoiceSummary
          hasPartItems={partItems.length > 0}
          hasLaborItems={laborItems.length > 0}
          partsSubtotal={partsSubtotal}
          laborSubtotal={laborSubtotal}
          subtotal={subtotal}
          discountAmount={discountAmount}
          discountType={discountType === 'none' ? null : discountType}
          discountValue={discountValue}
          taxRate={taxRate}
          taxAmount={taxAmount}
          displayTotal={displayTotal}
          totalPaid={totalPaid}
          balanceDue={balanceDue}
          hasPayments={(record.payments?.length ?? 0) > 0}
          currencyCode={currencyCode}
        />
      </div>
    </div>
  )

  const detailsRightColumn = (
    <div className="space-y-3">
      {record.publicToken && (
        <SharedLinkCard
          publicToken={record.publicToken}
          organizationId={organizationId}
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
      <BasicInfoSection
        initialData={initialData}
        vehicleId={vehicleId}
        vehicleName={vehicleName}
        selectedVehicleId={selectedVehicleId}
        setSelectedVehicleId={dirtySetSelectedVehicleId}
        vehicles={vehicles}
        vehicleOpen={vehicleOpen}
        setVehicleOpen={setVehicleOpen}
        type={type}
        setType={dirtySetType}
        status={status}
        setStatus={dirtySetStatus}
        techName={techName}
        customer={record.vehicle.customer}
      />
      <ScheduleTimesSection
        serviceRecordId={record.id}
        technicians={boardTechnicians}
        initialStartDateTime={initialData.startDateTime}
        initialEndDateTime={initialData.endDateTime}
        initialTechnicianId={record.technicianId}
        onSaved={flashSaved}
      />
      <TotalsSection
        partsSubtotal={partsSubtotal}
        laborSubtotal={laborSubtotal}
        subtotal={subtotal}
        discountType={discountType}
        setDiscountType={dirtySetDiscountType}
        discountValue={discountValue}
        setDiscountValue={dirtySetDiscountValue}
        discountAmount={discountAmount}
        taxEnabled={taxEnabled}
        taxRate={taxRate}
        setTaxRate={dirtySetTaxRate}
        taxAmount={taxAmount}
        totalAmount={totalAmount}
        currencyCode={currencyCode}
      />
      <ServiceAttachments
        attachments={record.attachments || []}
        imageAttachments={imageAttachments}
        onImageClick={setCarouselIndex}
        onDeleteAttachment={handleDeleteAttachment}
        deletingAttachment={deletingAttachment}
      />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <UnifiedServiceHeader
        vehicleId={vehicleId}
        vehicleName={vehicleName}
        title={record.title}
        status={status}
        paymentStatus={paymentStatus}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabCounts={{
          images: imageAttachmentsForManager.length,
          video: videoAttachments.length,
          documents: documentAttachments.length,
        }}
        downloading={downloading}
        saving={loading}
        hasUnsavedChanges={hasUnsavedChanges}
        showSaved={showSaved}
        onDownloadPDF={async () => { if (hasUnsavedChanges) await saveNow(); handleDownloadPDF() }}
        onDelete={handleDelete}
        onShowEmail={async () => { if (hasUnsavedChanges) await saveNow(); setShowEmailDialog(true) }}
        onShowShare={async () => { if (hasUnsavedChanges) await saveNow(); setShowShareDialog(true) }}
      />

      {activeTab === 'details' && (
        <form id="service-record-form" ref={formRef} onSubmit={handleSubmit} onInput={markDirty} className="flex min-h-0 flex-1 flex-col">
          <ServiceDetailContent leftColumn={detailsLeftColumn} rightColumn={detailsRightColumn} />
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

      <InventoryPickerDialog
        open={showInventoryPicker}
        onOpenChange={setShowInventoryPicker}
        inventoryParts={inventoryParts}
        currencyCode={currencyCode}
        onSelectPart={(part) => dirtySetPartItems((prev) => [...prev, part])}
      />

      <ImageCarousel
        images={imageAttachments}
        currentIndex={carouselIndex}
        onClose={() => setCarouselIndex(null)}
        onChangeIndex={setCarouselIndex}
      />

      <SendEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        defaultEmail={record.vehicle.customer?.email || ''}
        entityLabel={t('invoice.entityLabel')}
        onSend={async (email, message) =>
          sendInvoiceEmail({ serviceRecordId: record.id, recipientEmail: email, message })
        }
      />

      <ShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        recordId={record.id}
        organizationId={organizationId}
        initialToken={record.publicToken}
        customer={record.vehicle.customer}
        smsEnabled={smsEnabled}
        emailEnabled={emailEnabled}
      />

      {record.vehicle.customer && (
        <NotifyCustomerDialog
          open={showPaymentNotifyDialog}
          onOpenChange={setShowPaymentNotifyDialog}
          customer={record.vehicle.customer}
          defaultMessage={paymentNotifyMessage}
          emailSubject={t('invoice.emailSubject')}
          smsEnabled={smsEnabled}
          emailEnabled={emailEnabled}
          relatedEntityType="service-record"
          relatedEntityId={record.id}
        />
      )}
    </div>
  )
}
