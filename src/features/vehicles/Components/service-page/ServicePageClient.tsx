'use client'

import { useState } from 'react'
import { sendInvoiceEmail } from '@/features/email/Actions/emailActions'
import { SendEmailDialog } from '@/features/email/Components/SendEmailDialog'
import { useTranslations } from 'next-intl'

import { ServiceDetailContent } from '../service-detail/ServiceDetailContent'
import { ImageCarousel } from '../service-detail/ImageCarousel'
import { ShareDialog } from '../service-detail/ShareDialog'
import { NotifyCustomerDialog } from '@/components/notify-customer-dialog'
import { InventoryPickerDialog } from '../service-edit/InventoryPickerDialog'
import { ServiceImagesManager } from '../service-images-manager'
import { ServiceVideoManager } from '../service-video-manager'
import { ServiceDocumentsManager } from '../service-documents-manager'
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
  const t = useTranslations('service')
  const [activeTab, setActiveTab] = useState<ServiceTab>('details')

  const formState = useServiceFormState({
    vehicleId,
    initialData,
    defaultTaxRate,
    currentUserName,
    record,
  })

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
        onTabChange={setActiveTab}
        tabCounts={{
          images: imageAttachmentsForManager.length,
          video: videoAttachments.length,
          documents: documentAttachments.length,
        }}
        downloading={actions.downloading}
        saving={formState.loading}
        hasUnsavedChanges={formState.hasUnsavedChanges}
        showSaved={formState.showSaved}
        onDownloadPDF={async () => { if (formState.hasUnsavedChanges) await actions.saveNow(); actions.handleDownloadPDF() }}
        onDelete={actions.handleDelete}
        onShowEmail={async () => { if (formState.hasUnsavedChanges) await actions.saveNow(); actions.setShowEmailDialog(true) }}
        onShowShare={async () => { if (formState.hasUnsavedChanges) await actions.saveNow(); actions.setShowShareDialog(true) }}
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
                vehicles={vehicles}
                boardTechnicians={boardTechnicians}
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

      <InventoryPickerDialog
        open={formState.showInventoryPicker}
        onOpenChange={formState.setShowInventoryPicker}
        inventoryParts={inventoryParts}
        currencyCode={currencyCode}
        onSelectPart={(part) => formState.dirtySetPartItems((prev) => [...prev, part])}
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
    </div>
  )
}
