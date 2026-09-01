'use client'

import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  X,
} from 'lucide-react'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { formatDate as fmtDate, DEFAULT_DATE_FORMAT } from '@/lib/format'
import {
  isCustomFieldId,
  fromCustomFieldId,
  getOrderedFieldIds,
  getVisibleFieldsForSection,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

interface QuoteRecord {
  id: string
  quoteNumber: string | null
  title: string
  description: string | null
  status: string
  validUntil: Date | null
  createdAt: Date
  subtotal: number
  taxRate: number
  taxAmount: number
  taxInclusive?: boolean
  discountType: string | null
  discountValue: number
  discountAmount: number
  totalAmount: number
  notes: string | null
  partItems: {
    partNumber: string | null
    name: string
    quantity: number
    unit?: string | null
    unitPrice: number
    total: number
    excluded?: boolean
  }[]
  laborItems: {
    description: string
    hours: number
    rate: number
    total: number
    pricingType?: string
    excluded?: boolean
  }[]
  customer: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    company: string | null
    taxId?: string | null
  } | null
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
  } | null
}

interface InvoiceLayoutConfig {
  sections: Array<{
    id: string
    visible: boolean
    order: number
    column?: 'left' | 'right'
    fields?: Array<{ id: string; visible: boolean }>
  }>
}

interface CustomField {
  label: string
  value: string
  fieldType: string
  fieldId?: string
}

function isSectionVisible(config: InvoiceLayoutConfig | undefined, sectionId: string): boolean {
  if (!config) return true
  const section = config.sections.find((s) => s.id === sectionId)
  return section?.visible ?? true
}

function getSectionOrder(config: InvoiceLayoutConfig | undefined): string[] {
  if (!config)
    return [
      'header',
      'customer',
      'vehicle',
      'service',
      'parts_table',
      'labor_table',
      'totals',
      'general',
      'notes',
      'bank_account',
      'footer',
    ]
  return [...config.sections].sort((a, b) => a.order - b.order).map((s) => s.id)
}

function getCustomFieldsForSection(
  config: InvoiceLayoutConfig | null,
  sectionId: string,
  allCustomFields: CustomField[]
): CustomField[] {
  if (!config || !allCustomFields?.length) return []
  const section = config.sections.find((s) => s.id === sectionId)
  if (!section?.fields) return []
  const cfIds = new Set(
    section.fields
      .filter((f) => f.visible !== false && isCustomFieldId(f.id))
      .map((f) => fromCustomFieldId(f.id))
  )
  return allCustomFields.filter((cf) => cf.fieldId && cfIds.has(cf.fieldId))
}

function getUnassignedCustomFields(
  config: InvoiceLayoutConfig | null,
  allCustomFields: CustomField[]
): CustomField[] {
  if (!config || !allCustomFields?.length) return allCustomFields || []
  const assignedFieldIds = new Set<string>()
  for (const section of config.sections) {
    if (!section.fields) continue
    for (const f of section.fields) {
      if (isCustomFieldId(f.id)) {
        assignedFieldIds.add(fromCustomFieldId(f.id))
      }
    }
  }
  return allCustomFields.filter((cf) => !cf.fieldId || !assignedFieldIds.has(cf.fieldId))
}

interface QuoteAttachmentView {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  category: string
  description: string | null
  includeInInvoice: boolean
}

export function QuoteView({
  spec,
  quote,
  workshop,
  currencyCode,
  currencyFormat = 'symbol',
  orgId,
  token,
  logoUrl,
  showTorqvoiceBranding,
  dateFormat,
  timezone,
  primaryColor = '#d97706',
  headerStyle = 'standard',
  logoSize = 100,
  portalUrl,
  imageAttachments = [],
  documentAttachments = [],
  layoutConfig,
  customFields = [],
  serviceType = 'automotive',
  taxLabel,
}: {
  /** The document the workshop designed, built server-side from this quote. */
  spec: DocumentSpec
  quote: QuoteRecord
  workshop: { name: string; address: string; phone: string; email: string }
  currencyCode: string
  currencyFormat?: 'symbol' | 'code'
  orgId: string
  token: string
  logoUrl?: string
  showTorqvoiceBranding?: boolean
  dateFormat?: string
  timezone?: string
  primaryColor?: string
  headerStyle?: string
  logoSize?: number
  portalUrl?: string
  imageAttachments?: QuoteAttachmentView[]
  documentAttachments?: QuoteAttachmentView[]
  layoutConfig?: InvoiceLayoutConfig
  customFields?: CustomField[]
  serviceType?: 'automotive' | 'marine'
  taxLabel?: string
}) {
  const t = useTranslations('share.quote')
  const tc = useTranslations('share.common')

  const statusLabels: Record<string, string> = {
    draft: t('status.draft'),
    sent: t('status.sent'),
    accepted: t('status.accepted'),
    rejected: t('status.rejected'),
    expired: t('status.expired'),
    converted: t('status.converted'),
    changes_requested: t('status.changes_requested'),
  }

  const [downloading, setDownloading] = useState(false)
  const [status, setStatus] = useState(quote.status)
  const [submitting, setSubmitting] = useState(false)
  const [showChangesForm, setShowChangesForm] = useState(false)
  const [changeMessage, setChangeMessage] = useState('')
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)

  // Track view on mount
  useEffect(() => {
    fetch('/api/public/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'quote', token }),
    }).catch(() => {
      /* fire-and-forget */
    })
  }, [token])

  const quoteNum = quote.quoteNumber || `QT-${quote.id.slice(-8).toUpperCase()}`
  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const createdDate = fmtDate(quote.createdAt, df, tz)
  const validUntilDate = quote.validUntil ? fmtDate(quote.validUntil, df, tz) : null
  const shopName = workshop.name || 'Torqvoice'

  // Layout config overrides for header field visibility & ordering
  const headerVisibleFields = getVisibleFieldsForSection(layoutConfig, 'header')
  const headerFieldOrder = getOrderedFieldIds(headerVisibleFields, [
    'logo',
    'company_name',
    'company_address',
    'company_phone',
    'company_email',
    'company_org_number',
  ])
  const effectiveShowLogo = headerVisibleFields ? headerFieldOrder.includes('logo') : true
  const effectiveShowCompanyName = headerVisibleFields
    ? headerFieldOrder.includes('company_name')
    : true

  const sectionOrder = getSectionOrder(layoutConfig)

  // Image carousel
  const openCarousel = (index: number) => setCarouselIndex(index)
  const closeCarousel = () => setCarouselIndex(null)
  const prevImage = useCallback(
    () => setCarouselIndex((i) => (i !== null && i > 0 ? i - 1 : i)),
    []
  )
  const nextImage = useCallback(
    () => setCarouselIndex((i) => (i !== null && i < imageAttachments.length - 1 ? i + 1 : i)),
    [imageAttachments.length]
  )

  useEffect(() => {
    if (carouselIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCarousel()
      else if (e.key === 'ArrowLeft') prevImage()
      else if (e.key === 'ArrowRight') nextImage()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [carouselIndex, prevImage, nextImage])

  const touchStartX = useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) prevImage()
      else nextImage()
    }
    touchStartX.current = null
  }

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/public/share/quote/${orgId}/${token}/pdf`)
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${quoteNum}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    }
    setDownloading(false)
  }

  const handleQuoteResponse = async (
    action: 'accepted' | 'changes_requested',
    message?: string
  ) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/forms/quote-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id, publicToken: token, action, message }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus(action)
        setShowChangesForm(false)
        setChangeMessage('')
      }
    } catch {
      // silent
    }
    setSubmitting(false)
  }

  const canRespond = status === 'draft' || status === 'sent'

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t('downloadPdf')}
        </button>
      </div>

      {/* The saved design, drawn by the same engine as the designer and the
          printed PDF. The sheet is its own paper, so it stands on the page
          rather than being boxed inside another card. */}
      <SpecSheet spec={spec} />

      <div className="mt-6 rounded-xl border bg-white p-6 shadow-sm empty:hidden sm:p-8 dark:bg-gray-900 [&>div:first-child]:mt-0">
        {/* Image Attachments (not part of layout config sections) */}
        {imageAttachments.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 flex items-center gap-2 font-semibold">
              <Camera className="h-4 w-4" />
              {t('images', { count: imageAttachments.length })}
            </h4>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {imageAttachments.map((att, idx) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => openCarousel(idx)}
                  className="group flex flex-col overflow-hidden rounded-lg border"
                >
                  <img
                    src={att.fileUrl}
                    alt={att.description || att.fileName}
                    className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <p className="truncate px-1.5 py-1 text-xs text-gray-500">
                    {att.description || '\u00A0'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Document Attachments */}
        {documentAttachments.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-semibold">{t('documents')}</h4>
            <div className="space-y-2">
              {documentAttachments.map((att) => (
                <a
                  key={att.id}
                  href={att.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <FileText className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {att.fileName}
                  </span>
                  <Download className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Customer Actions */}
        {canRespond && !showChangesForm && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={() => setShowChangesForm(true)}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <MessageSquare className="h-4 w-4" />
              {t('requestChanges')}
            </button>
            <button
              onClick={() => handleQuoteResponse('accepted')}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t('acceptQuote')}
            </button>
          </div>
        )}

        {canRespond && showChangesForm && (
          <div className="mt-8 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('whatChanges')}
            </label>
            <textarea
              value={changeMessage}
              onChange={(e) => setChangeMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              placeholder={t('changePlaceholder')}
            />
            <div className="mt-3 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowChangesForm(false)
                  setChangeMessage('')
                }}
                disabled={submitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleQuoteResponse('changes_requested', changeMessage)}
                disabled={submitting || !changeMessage.trim()}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                {t('submitRequest')}
              </button>
            </div>
          </div>
        )}

        {status === 'accepted' && (
          <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                {t('quoteAccepted')}
              </p>
            </div>
            <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-500">
              {t('quoteAcceptedMessage')}
            </p>
          </div>
        )}

        {status === 'changes_requested' && (
          <div className="mt-8 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <p className="font-medium text-orange-700 dark:text-orange-400">
                {t('changesRequested')}
              </p>
            </div>
            <p className="mt-1 text-sm text-orange-600 dark:text-orange-500">
              {t('changesRequestedMessage')}
            </p>
          </div>
        )}

        {/* Torqvoice branding near totals */}
        {showTorqvoiceBranding && (
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="text-xs text-gray-400">{tc('poweredBy')}</span>
            <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Torqvoice
            </span>
          </div>
        )}
      </div>

      {portalUrl && (
        <div className="mt-3 border-t pt-3 text-center">
          <p className="text-xs text-muted-foreground">
            {tc('portalMessage')}{' '}
            <a href={portalUrl} className="font-medium text-primary hover:underline">
              {tc('customerPortal')}
            </a>
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {showTorqvoiceBranding ? (
          <>
            <span className="text-xs text-gray-400">{tc('poweredBy')}</span>
            <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-4 w-4" />
            <a
              href="https://torqvoice.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Torqvoice
            </a>
          </>
        ) : (
          <p className="text-center text-xs text-gray-400">{shopName}</p>
        )}
      </div>

      {/* Image Carousel Modal */}
      {carouselIndex !== null && imageAttachments[carouselIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={closeCarousel}
            className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:top-4 sm:right-4"
          >
            <X className="h-5 w-5" />
          </button>

          {imageAttachments.length > 1 && (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white sm:top-4">
              {carouselIndex + 1} / {imageAttachments.length}
            </div>
          )}

          {carouselIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                prevImage()
              }}
              className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:left-4 sm:h-12 sm:w-12"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {carouselIndex < imageAttachments.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                nextImage()
              }}
              className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:right-4 sm:h-12 sm:w-12"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <div
            className="flex max-h-[85vh] max-w-[90vw] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageAttachments[carouselIndex].fileUrl}
              alt={
                imageAttachments[carouselIndex].description ||
                imageAttachments[carouselIndex].fileName
              }
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
              draggable={false}
            />
            {imageAttachments[carouselIndex].description && (
              <p className="mt-2 max-w-md text-center text-sm text-white/80">
                {imageAttachments[carouselIndex].description}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
