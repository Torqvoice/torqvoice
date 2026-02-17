'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { updateServiceRecord, deleteServiceRecord, deleteServiceAttachment, toggleManuallyPaid } from '@/features/vehicles/Actions/serviceActions'
import { createPayment, deletePayment } from '@/features/payments/Actions/paymentActions'
import { sendInvoiceEmail } from '@/features/email/Actions/emailActions'
import { SendEmailDialog } from '@/features/email/Components/SendEmailDialog'
import type { ServicePartInput, ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import type { ServiceDetail } from '../service-detail/types'
import type { InitialData, InventoryPartOption, VehicleOption, TeamMemberOption } from '../service-edit/form-types'

import { ServiceDetailContent } from '../service-detail/ServiceDetailContent'
import { InvoiceSummary } from '../service-detail/InvoiceSummary'
import { PaymentsSection } from '../service-detail/PaymentsSection'
import { ServiceAttachments } from '../service-detail/ServiceAttachments'
import { ImageCarousel } from '../service-detail/ImageCarousel'
import { ShareDialog } from '../service-detail/ShareDialog'

import { BasicInfoSection } from '../service-edit/BasicInfoSection'
import { PartsEditor } from '../service-edit/PartsEditor'
import { LaborEditor } from '../service-edit/LaborEditor'
import { TotalsSection } from '../service-edit/TotalsSection'
import { NotesSection } from '../service-edit/NotesSection'
import { InventoryPickerDialog } from '../service-edit/InventoryPickerDialog'

import { ServiceImagesManager } from '../service-images-manager'
import { ServiceVideoManager } from '../service-video-manager'
import { ServiceDocumentsManager } from '../service-documents-manager'

import { UnifiedServiceHeader, type ServiceTab } from './UnifiedServiceHeader'

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
  teamMembers: TeamMemberOption[]
  currentUserName: string
  // Media data
  imageAttachmentsForManager: Attachment[]
  videoAttachments: Attachment[]
  documentAttachments: Attachment[]
  maxImagesPerService: number
  maxDiagnosticsPerService: number
  maxDocumentsPerService: number
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
  teamMembers,
  currentUserName,
  imageAttachmentsForManager,
  videoAttachments,
  documentAttachments,
  maxImagesPerService,
  maxDiagnosticsPerService,
  maxDocumentsPerService,
}: ServicePageClientProps) {
  const router = useRouter()
  const modal = useGlassModal()
  const confirm = useConfirm()
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'

  // Tab state
  const [activeTab, setActiveTab] = useState<ServiceTab>('details')

  // Form state (from ServiceRecordForm)
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

  // Detail-page state
  const [downloading, setDownloading] = useState(false)
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null)
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showEmailDialog, setShowEmailDialog] = useState(false)

  const displayTotal = totalAmount > 0 ? totalAmount : record.cost
  const totalPaid = record.payments?.reduce((sum, p) => sum + p.amount, 0) || 0
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

  // Form submit
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

  // Detail actions
  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Service Record',
      description:
        'This will permanently delete this service record and all associated data. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    const result = await deleteServiceRecord(record.id)
    if (result.success) {
      router.push(`/vehicles/${vehicleId}`)
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to delete')
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/services/${record.id}/pdf`)
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
      modal.open('error', 'Error', 'Failed to generate PDF invoice')
    }
    setDownloading(false)
  }

  const handleDeleteAttachment = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Attachment',
      description: 'This will permanently delete this attachment. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingAttachment(id)
    const result = await deleteServiceAttachment(id)
    if (result.success) {
      toast.success('Attachment deleted')
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to delete attachment')
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
      toast.success('Payment recorded')
      router.refresh()
      return true
    }
    modal.open('error', 'Error', result.error || 'Failed to record payment')
    return false
  }

  const handleTogglePaid = async () => {
    setPaymentLoading(true)
    const result = await toggleManuallyPaid(record.id)
    setPaymentLoading(false)
    if (result.success) {
      toast.success(result.data?.manuallyPaid ? 'Marked as paid' : 'Marked as unpaid')
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to update payment status')
    }
  }

  const handleDeletePayment = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Payment',
      description: 'This will remove this payment record.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingPayment(id)
    const result = await deletePayment(id)
    if (result.success) {
      toast.success('Payment deleted')
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to delete payment')
    }
    setDeletingPayment(null)
  }

  // Details tab content
  const detailsLeftColumn = (
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
        customer={record.vehicle.customer}
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
        onDownloadPDF={handleDownloadPDF}
        onDelete={handleDelete}
        onShowEmail={() => setShowEmailDialog(true)}
        onShowShare={() => setShowShareDialog(true)}
      />

      {activeTab === 'details' && (
        <form id="service-record-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
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
        onSelectPart={(part) => setPartItems((prev) => [...prev, part])}
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
        entityLabel="Invoice"
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
      />
    </div>
  )
}
