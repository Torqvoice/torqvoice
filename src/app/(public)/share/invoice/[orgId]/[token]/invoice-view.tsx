'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Film,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { formatCurrency, formatDate as fmtDate, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { calculateTotals, netLineTotal } from '@/lib/tax'
import { useLocale, useTranslations } from 'next-intl'
import {
  isCustomFieldId,
  fromCustomFieldId,
  getOrderedFieldIds,
  getVisibleFieldsForSection,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

interface InvoiceRecord {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  serviceDate: Date
  startDateTime: Date | null
  invoiceDate: Date | null
  invoiceDueDate: Date | null
  shopName: string | null
  techName: string | null
  mileage: number | null
  diagnosticNotes: string | null
  invoiceNotes: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  taxInclusive?: boolean
  totalAmount: number
  cost: number
  invoiceNumber: string | null
  manuallyPaid: boolean
  discountType: string | null
  discountValue: number
  discountAmount: number
  warrantyMonths: number | null
  warrantyMileage: number | null
  warrantyExpiresAt: Date | string | null
  warrantyNotes: string | null
  partItems: {
    partNumber: string | null
    name: string
    quantity: number
    unit?: string | null
    unitPrice: number
    total: number
  }[]
  laborItems: {
    description: string
    hours: number
    rate: number
    total: number
    pricingType?: string
  }[]
  payments: {
    amount: number
    date: Date
    method: string
  }[]
  attachments: {
    id: string
    fileName: string
    fileUrl: string
    fileType: string
    fileSize: number
    category: string
    description: string | null
  }[]
  customer?: {
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
    mileage: number
    customer: {
      name: string
      email: string | null
      phone: string | null
      address: string | null
      company: string | null
      taxId?: string | null
    } | null
  } | null
}

interface InvoiceSettings {
  bankAccount: string
  orgNumber: string
  paymentTerms: string
  footerNote: string
  showBankAccount: boolean
  showOrgNumber: boolean
  dueDays: number
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

function isFieldVisible(
  config: InvoiceLayoutConfig | undefined,
  sectionId: string,
  fieldId: string
): boolean {
  if (!config) return true
  const section = config.sections.find((s) => s.id === sectionId)
  if (!section?.visible) return false
  if (!section.fields) return true
  const field = section.fields.find((f) => f.id === fieldId)
  return field?.visible ?? true
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
      'findings',
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

function hasContent(html: string | null): boolean {
  if (!html) return false
  return html.replace(/<[^>]*>/g, '').trim().length > 0
}

export function InvoiceView({
  spec,
  record,
  workshop,
  currencyCode,
  currencyFormat = 'symbol',
  orgId,
  token,
  enabledProviders = [],
  invoiceSettings,
  logoUrl,
  showLogo = true,
  showCompanyName = true,
  showTorqvoiceBranding,
  dateFormat,
  timezone,
  termsOfSaleUrl,
  primaryColor = '#d97706',
  headerStyle = 'standard',
  logoSize = 100,
  portalUrl,
  layoutConfig,
  customFields = [],
  findings = [],
  telegramBotLink,
  serviceType = 'automotive',
  taxLabel,
}: {
  /** The document the workshop designed, built server-side from this job. */
  spec: DocumentSpec
  record: InvoiceRecord
  workshop: { name: string; address: string; phone: string; email: string }
  currencyCode: string
  currencyFormat?: 'symbol' | 'code'
  orgId: string
  token: string
  enabledProviders?: string[]
  invoiceSettings?: InvoiceSettings
  logoUrl?: string
  showLogo?: boolean
  showCompanyName?: boolean
  showTorqvoiceBranding?: boolean
  dateFormat?: string
  timezone?: string
  termsOfSaleUrl?: string
  primaryColor?: string
  headerStyle?: string
  logoSize?: number
  portalUrl?: string
  layoutConfig?: InvoiceLayoutConfig
  customFields?: CustomField[]
  findings?: Array<{ description: string; severity: string; notes: string | null }>
  telegramBotLink?: string
  serviceType?: 'automotive' | 'marine'
  taxLabel?: string
}) {
  const t = useTranslations('share.invoice')
  const tc = useTranslations('share.common')
  const locale = useLocale()
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState<{ amount: number } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [customAmount, setCustomAmount] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Track view on mount
  useEffect(() => {
    fetch('/api/public/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice', token }),
    }).catch(() => {
      /* fire-and-forget */
    })
  }, [token])

  const vehicleName = record.vehicle
    ? `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`
    : ''
  const partsSubtotalStored = record.partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotalStored = record.laborItems.reduce((sum, l) => sum + l.total, 0)
  const computedSubtotalStored = partsSubtotalStored + laborSubtotalStored
  const computedDiscountStored =
    record.discountType === 'percentage'
      ? computedSubtotalStored * (record.discountValue / 100)
      : record.discountType === 'fixed'
        ? Math.min(record.discountValue, computedSubtotalStored)
        : 0
  const recordTaxInclusive = record.taxInclusive ?? false
  const { taxAmount: computedTax, totalAmount: computedTotal } = calculateTotals({
    subtotal: computedSubtotalStored,
    discountAmount: computedDiscountStored,
    taxRate: record.taxRate,
    taxInclusive: recordTaxInclusive,
  })

  // Universal display: net per-line/category in both modes (no-op for exclusive,
  // back-calculates for inclusive). The customer-facing total stays the same.
  const partsSubtotal = netLineTotal(partsSubtotalStored, record.taxRate, recordTaxInclusive)
  const laborSubtotal = netLineTotal(laborSubtotalStored, record.taxRate, recordTaxInclusive)
  const computedSubtotal = netLineTotal(computedSubtotalStored, record.taxRate, recordTaxInclusive)
  const computedDiscount = netLineTotal(computedDiscountStored, record.taxRate, recordTaxInclusive)
  const displayDiscountAmount = netLineTotal(
    record.discountAmount,
    record.taxRate,
    recordTaxInclusive
  )
  const displayTotal =
    record.totalAmount > 0 ? record.totalAmount : computedTotal > 0 ? computedTotal : record.cost
  const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`
  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const effectiveInvoiceDate = record.invoiceDate ?? record.startDateTime ?? record.serviceDate
  const serviceDate = fmtDate(effectiveInvoiceDate, df, tz)
  const paidFromPayments = record.payments.reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = record.manuallyPaid ? displayTotal : paidFromPayments
  const balanceDue = displayTotal - totalPaid
  const shopName = workshop.name || record.shopName || 'Torqvoice'

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
  const effectiveShowLogo = headerVisibleFields ? headerFieldOrder.includes('logo') : showLogo
  const effectiveShowCompanyName = headerVisibleFields
    ? headerFieldOrder.includes('company_name')
    : showCompanyName

  const sectionOrder = getSectionOrder(layoutConfig)

  const showPaymentSection = enabledProviders.length > 0 && balanceDue > 0 && !paymentSuccess

  // Deduplicated image list for carousel
  const imageAttachments = (() => {
    const seen = new Set<string>()
    return (record.attachments || []).filter((a) => {
      if (a.fileType.startsWith('image/')) {
        if (seen.has(a.fileName)) return false
        seen.add(a.fileName)
        return true
      }
      return false
    })
  })()

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

  // Keyboard navigation for carousel
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

  // Touch swipe for carousel
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

  // Pre-fill payment amount with balance due
  useEffect(() => {
    if (balanceDue > 0 && !paymentAmount) {
      setPaymentAmount(balanceDue.toFixed(2))
    }
  }, [balanceDue, paymentAmount])

  // Verify payment on return from provider
  const verifyPayment = useCallback(
    async (provider: string, externalId: string) => {
      setVerifying(true)
      try {
        const res = await fetch(`/api/public/share/invoice/${orgId}/${token}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, externalId }),
        })
        const data = await res.json()
        if (data.verified) {
          setPaymentSuccess({ amount: data.amount })
        } else {
          setPaymentError(t('errorVerifyFailed'))
        }
      } catch {
        setPaymentError(t('errorVerifyRequest'))
      } finally {
        setVerifying(false)
      }
    },
    [orgId, token]
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const reference = params.get('reference')

    const paypalOrderId = params.get('paypal_order_id')

    if (sessionId) {
      verifyPayment('stripe', sessionId)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (reference) {
      verifyPayment('vipps', reference)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (paypalOrderId) {
      verifyPayment('paypal', paypalOrderId)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [verifyPayment])

  const handleDownloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/public/share/invoice/${orgId}/${token}/pdf`)
      if (!res.ok) throw new Error('Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNum}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    }
    setDownloading(false)
  }

  const handlePayment = async (provider: string) => {
    setPaymentError(null)
    const amount = Number.parseFloat(paymentAmount)
    if (Number.isNaN(amount) || amount < 0.01) {
      setPaymentError(t('errorInvalidAmount'))
      return
    }
    if (amount > balanceDue + 0.01) {
      setPaymentError(
        t('errorExceedsBalance', {
          amount: formatCurrency(balanceDue, currencyCode, currencyFormat),
        })
      )
      return
    }

    setPaymentLoading(provider)
    try {
      const res = await fetch(`/api/public/share/invoice/${orgId}/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPaymentError(data.error || t('errorCheckoutFailed'))
        return
      }
      window.location.href = data.redirectUrl
    } catch {
      setPaymentError(t('errorPaymentFailed'))
    } finally {
      setPaymentLoading(null)
    }
  }

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

      {/* Payment Success Banner */}
      {paymentSuccess && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <svg
              className="h-5 w-5 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
            {t('paymentReceived')}
          </p>
          <p className="text-sm text-emerald-600 dark:text-emerald-500">
            {t('paymentApplied', {
              amount: formatCurrency(paymentSuccess.amount, currencyCode, currencyFormat),
            })}
          </p>
        </div>
      )}

      {/* Verifying Banner */}
      {verifying && (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border bg-gray-50 p-5 shadow-sm dark:bg-gray-800">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <span className="font-medium">{t('verifyingPayment')}</span>
        </div>
      )}

      {/* Pay Invoice Banner — top of page */}
      {showPaymentSection && !verifying && (
        <div className="mb-6 overflow-hidden rounded-xl border shadow-sm">
          <div className="bg-linear-to-r from-amber-500 to-amber-600 px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <CreditCard className="h-4 w-4" />
                <span className="text-sm font-semibold">{t('balanceDue')}</span>
              </div>
              <span className="text-lg font-bold text-white">
                {formatCurrency(balanceDue, currencyCode, currencyFormat)}
              </span>
            </div>
          </div>
          <div className="bg-white p-5 dark:bg-gray-900">
            {/* Amount selection */}
            <div className="mb-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomAmount(false)
                    setPaymentAmount(balanceDue.toFixed(2))
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    !customAmount
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {t('fullAmount')}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomAmount(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    customAmount
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {t('partialPayment')}
                </button>
              </div>
              {customAmount && (
                <div className="mt-3">
                  <label
                    htmlFor="payAmount"
                    className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {t('enterAmount')}
                  </label>
                  <input
                    id="payAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={balanceDue}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full max-w-50 rounded-lg border bg-white px-3 py-2 text-lg font-semibold tabular-nums focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:bg-gray-800"
                  />
                </div>
              )}
            </div>

            {paymentError && <p className="mb-3 text-sm text-red-600">{paymentError}</p>}

            {/* Provider buttons */}
            <div className="flex flex-wrap gap-3">
              {enabledProviders.includes('stripe') && (
                <button
                  onClick={() => handlePayment('stripe')}
                  disabled={paymentLoading !== null}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 sm:flex-none"
                >
                  {paymentLoading === 'stripe' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {t('payWithCard', {
                    amount: formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode),
                  })}
                </button>
              )}
              {enabledProviders.includes('vipps') && (
                <button
                  onClick={() => handlePayment('vipps')}
                  disabled={paymentLoading !== null}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#ff5b24] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e54e1c] disabled:opacity-50 sm:flex-none"
                >
                  {paymentLoading === 'vipps' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-base font-black leading-none">V</span>
                  )}
                  {t('payWithVipps', {
                    amount: formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode),
                  })}
                </button>
              )}
              {enabledProviders.includes('paypal') && (
                <button
                  onClick={() => handlePayment('paypal')}
                  disabled={paymentLoading !== null}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0070ba] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#005ea6] disabled:opacity-50 sm:flex-none"
                >
                  {paymentLoading === 'paypal' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-base font-black leading-none">P</span>
                  )}
                  {t('payWithPaypal', {
                    amount: formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode),
                  })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* The saved design, drawn by the same engine as the designer and the
          printed PDF. The sheet is its own paper, so it stands on the page
          rather than being boxed inside another card. */}
      <SpecSheet spec={spec} />

      <div className="mt-6 space-y-6 empty:hidden">
        {telegramBotLink && isSectionVisible(layoutConfig, 'telegram_qr') && (
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900">
            <p className="text-sm font-medium text-foreground">{tc('telegramConnect')}</p>
            <div className="rounded-lg bg-white p-2">
              <QRCodeSVG value={telegramBotLink} size={100} />
            </div>
            <p className="text-center text-xs text-muted-foreground">{tc('telegramScan')}</p>
          </div>
        )}

        {/* Service Images (not part of layout config sections) */}
        {imageAttachments.length > 0 && (
          <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900">
            <h4 className="mb-3 flex items-center gap-2 font-semibold">
              <Camera className="h-4 w-4" />
              {t('serviceImages', { count: imageAttachments.length })}
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

        {/* Service Videos */}
        {(() => {
          const videoAttachments = (record.attachments || []).filter((a) =>
            a.fileType.startsWith('video/')
          )
          if (videoAttachments.length === 0) return null
          return (
            <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900">
              <h4 className="mb-3 flex items-center gap-2 font-semibold">
                <Film className="h-4 w-4" />
                {t('serviceVideos', { count: videoAttachments.length })}
              </h4>
              <div className="space-y-3">
                {videoAttachments.map((att) => (
                  <div key={att.id} className="overflow-hidden rounded-lg border">
                    <video
                      src={att.fileUrl}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full"
                    />
                    {att.description && (
                      <p className="px-3 py-2 text-sm text-gray-500">{att.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Diagnostic Reports */}
        {record.attachments &&
          (() => {
            const seen = new Set<string>()
            const reports = record.attachments.filter((a) => {
              if (!a.fileType.startsWith('image/')) {
                if (seen.has(a.fileName)) return false
                seen.add(a.fileName)
                return true
              }
              return false
            })
            if (reports.length === 0) return null
            return (
              <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900">
                <h4 className="mb-3 flex items-center gap-2 font-semibold">
                  <Paperclip className="h-4 w-4" />
                  {t('diagnosticReports', { count: reports.length })}
                </h4>
                <div className="space-y-2">
                  {reports.map((att) => (
                    <a
                      key={att.id}
                      href={att.fileUrl}
                      download={att.fileName}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {att.fileType === 'application/pdf' ? (
                        <FileText className="h-5 w-5 shrink-0 text-red-500" />
                      ) : (
                        <Paperclip className="h-5 w-5 shrink-0 text-gray-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{att.fileName}</p>
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-gray-400" />
                    </a>
                  ))}
                </div>
              </div>
            )
          })()}
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

      <div className="mt-4 flex flex-col items-center gap-1">
        {showTorqvoiceBranding ? (
          <div className="flex items-center justify-center gap-1.5">
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
          </div>
        ) : (
          <p className="text-center text-xs text-gray-400">{shopName}</p>
        )}
        {termsOfSaleUrl && (
          <a
            href={termsOfSaleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {tc('termsOfSale')}
          </a>
        )}
      </div>

      {/* Image Carousel Modal */}
      {carouselIndex !== null && imageAttachments[carouselIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeCarousel}
            className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 sm:top-4 sm:right-4"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Counter */}
          {imageAttachments.length > 1 && (
            <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white sm:top-4">
              {carouselIndex + 1} / {imageAttachments.length}
            </div>
          )}

          {/* Previous button */}
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

          {/* Next button */}
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

          {/* Image */}
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
