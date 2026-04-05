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
import { sanitizeHtml } from '@/lib/sanitize-html'
import { useLocale, useTranslations } from 'next-intl'
import { isCustomFieldId, fromCustomFieldId, groupSectionsForRendering, getDefaultInvoiceLayout, getOrderedFieldIds, getVisibleFieldsForSection } from '@/features/settings/Schema/invoiceLayoutSchema'

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
  totalAmount: number
  cost: number
  invoiceNumber: string | null
  manuallyPaid: boolean
  discountType: string | null
  discountValue: number
  discountAmount: number
  partItems: {
    partNumber: string | null
    name: string
    quantity: number
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
    } | null
  }
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
  const section = config.sections.find(s => s.id === sectionId)
  return section?.visible ?? true
}

function isFieldVisible(config: InvoiceLayoutConfig | undefined, sectionId: string, fieldId: string): boolean {
  if (!config) return true
  const section = config.sections.find(s => s.id === sectionId)
  if (!section?.visible) return false
  if (!section.fields) return true
  const field = section.fields.find(f => f.id === fieldId)
  return field?.visible ?? true
}

function getSectionOrder(config: InvoiceLayoutConfig | undefined): string[] {
  if (!config) return ['header', 'customer', 'vehicle', 'service', 'parts_table', 'labor_table', 'findings', 'totals', 'general', 'notes', 'diagnostic_notes', 'bank_account', 'footer']
  return [...config.sections].sort((a, b) => a.order - b.order).map(s => s.id)
}

function getCustomFieldsForSection(
  config: InvoiceLayoutConfig | null,
  sectionId: string,
  allCustomFields: CustomField[],
): CustomField[] {
  if (!config || !allCustomFields?.length) return []
  const section = config.sections.find(s => s.id === sectionId)
  if (!section?.fields) return []
  const cfIds = new Set(
    section.fields
      .filter(f => f.visible !== false && isCustomFieldId(f.id))
      .map(f => fromCustomFieldId(f.id))
  )
  return allCustomFields.filter(cf => cf.fieldId && cfIds.has(cf.fieldId))
}

function getUnassignedCustomFields(
  config: InvoiceLayoutConfig | null,
  allCustomFields: CustomField[],
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
  return allCustomFields.filter(cf => !cf.fieldId || !assignedFieldIds.has(cf.fieldId))
}

function hasContent(html: string | null): boolean {
  if (!html) return false
  return html.replace(/<[^>]*>/g, '').trim().length > 0
}

export function InvoiceView({
  record,
  workshop,
  currencyCode,
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
  serviceType = "automotive",
}: {
  record: InvoiceRecord
  workshop: { name: string; address: string; phone: string; email: string }
  currencyCode: string
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
  serviceType?: "automotive" | "marine"
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
    }).catch(() => { /* fire-and-forget */ })
  }, [token])

  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`
  const partsSubtotal = record.partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotal = record.laborItems.reduce((sum, l) => sum + l.total, 0)
  const computedSubtotal = partsSubtotal + laborSubtotal
  const computedDiscount = record.discountType === 'percentage'
    ? computedSubtotal * (record.discountValue / 100)
    : record.discountType === 'fixed'
      ? Math.min(record.discountValue, computedSubtotal)
      : 0
  const computedTax = (computedSubtotal - computedDiscount) * (record.taxRate / 100)
  const computedTotal = computedSubtotal - computedDiscount + computedTax
  const displayTotal = record.totalAmount > 0 ? record.totalAmount : computedTotal > 0 ? computedTotal : record.cost
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
  const headerFieldOrder = getOrderedFieldIds(headerVisibleFields, ['logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'company_org_number'])
  const effectiveShowLogo = headerVisibleFields ? headerFieldOrder.includes('logo') : showLogo
  const effectiveShowCompanyName = headerVisibleFields ? headerFieldOrder.includes('company_name') : showCompanyName

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
      setPaymentError(t('errorExceedsBalance', { amount: formatCurrency(balanceDue, currencyCode) }))
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
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
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
            {t('paymentApplied', { amount: formatCurrency(paymentSuccess.amount, currencyCode) })}
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
                {formatCurrency(balanceDue, currencyCode)}
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
                  {t('payWithCard', { amount: formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode) })}
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
                  {t('payWithVipps', { amount: formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode) })}
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
                  {t('payWithPaypal', { amount: formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode) })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8 dark:bg-gray-900">
        {(() => {
          // Use column-based grouping for layout
          const effectiveSections = layoutConfig?.sections ?? getDefaultInvoiceLayout().sections;
          const groups = groupSectionsForRendering(effectiveSections);
          // Build maps: which sections are in a column group, and which are paired
          const columnGroupMap = new Map<string, { left: string[]; right: string[] }>();
          const skipSet = new Set<string>();
          for (const g of groups) {
            if (g.type === 'columns') {
              const allIds = [...g.left, ...g.right];
              const firstId = allIds[0];
              if (firstId) {
                columnGroupMap.set(firstId, g);
                for (const id of allIds.slice(1)) skipSet.add(id);
              }
            }
          }
          return sectionOrder.map((sectionId) => {
          if (!isSectionVisible(layoutConfig, sectionId)) return null
          if (skipSet.has(sectionId)) return null

          switch (sectionId) {
            case 'header':
              return (
                <div key="header">
                  {(() => {
                    const renderModernField = (fid: string) => {
                      switch (fid) {
                        case 'logo': return effectiveShowLogo && logoUrl ? <img key="logo" src={logoUrl} alt={shopName} className="mx-auto mb-2 object-contain" style={{ maxHeight: 64 * (logoSize / 100), maxWidth: 180 * (logoSize / 100) }} /> : null
                        case 'company_name': return effectiveShowCompanyName ? <h2 key="cn" className="text-xl font-bold sm:text-2xl">{shopName}</h2> : null
                        case 'company_address': return workshop.address ? <p key="addr" className="mt-1 text-sm opacity-80">{workshop.address}</p> : null
                        case 'company_phone': return workshop.phone ? <p key="ph" className="text-sm opacity-70">{t('tel', { phone: workshop.phone })}</p> : null
                        case 'company_email': return workshop.email ? <p key="em" className="text-sm opacity-70">{workshop.email}</p> : null
                        case 'company_org_number': return null
                        default: return null
                      }
                    }
                    const renderCompactField = (fid: string) => {
                      switch (fid) {
                        case 'logo': return effectiveShowLogo && logoUrl ? <img key="logo" src={logoUrl} alt={shopName} className="rounded object-contain" style={{ height: 48 * (logoSize / 100), width: 48 * (logoSize / 100) }} /> : null
                        case 'company_name': return effectiveShowCompanyName ? <h2 key="cn" className="text-lg font-bold" style={{ color: primaryColor }}>{shopName}</h2> : null
                        case 'company_address': return workshop.address ? <p key="addr" className="text-sm text-gray-500">{workshop.address}</p> : null
                        case 'company_phone': return workshop.phone ? <p key="ph" className="text-sm text-gray-500">{t('tel', { phone: workshop.phone })}</p> : null
                        case 'company_email': return workshop.email ? <p key="em" className="text-sm text-gray-500">{workshop.email}</p> : null
                        case 'company_org_number': return null
                        default: return null
                      }
                    }
                    const renderStandardField = (fid: string) => {
                      switch (fid) {
                        case 'logo': return effectiveShowLogo && logoUrl ? <img key="logo" src={logoUrl} alt={shopName} className="mb-2 object-contain object-left" style={{ maxHeight: 64 * (logoSize / 100), maxWidth: 180 * (logoSize / 100) }} /> : null
                        case 'company_name': return effectiveShowCompanyName ? <h2 key="cn" className="text-xl font-bold sm:text-2xl" style={{ color: primaryColor }}>{shopName}</h2> : null
                        case 'company_address': return workshop.address ? <p key="addr" className="mt-1 text-sm text-gray-500">{workshop.address}</p> : null
                        case 'company_phone': return workshop.phone ? <p key="ph" className="text-sm text-gray-500">{t('tel', { phone: workshop.phone })}</p> : null
                        case 'company_email': return workshop.email ? <p key="em" className="text-sm text-gray-500">{workshop.email}</p> : null
                        case 'company_org_number': return null
                        default: return null
                      }
                    }

                    if (headerStyle === 'modern') return (
                      <>
                        <div className="rounded-lg p-6 text-center text-white" style={{ backgroundColor: primaryColor }}>
                          {headerFieldOrder.map(renderModernField)}
                        </div>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-xl font-bold uppercase">{t('title')}</h3>
                          <div className="flex gap-3 text-sm text-gray-500">
                            <span>{invoiceNum}</span>
                            <span>{serviceDate}</span>
                          </div>
                        </div>
                      </>
                    )
                    if (headerStyle === 'compact') return (
                      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: '#e5e7eb' }}>
                        <div>
                          {headerFieldOrder.map(renderCompactField)}
                        </div>
                        <div className="sm:text-right">
                          <h3 className="text-lg font-bold uppercase">{t('title')}</h3>
                          <p className="text-sm text-gray-500">{invoiceNum}</p>
                          <p className="text-sm text-gray-500">{serviceDate}</p>
                        </div>
                      </div>
                    )
                    /* Standard */
                    return (
                      <div className="flex flex-col gap-4 border-b-2 pb-6 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: primaryColor }}>
                        <div>
                          {headerFieldOrder.map(renderStandardField)}
                        </div>
                        <div className="sm:text-right">
                          {showTorqvoiceBranding && (
                            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                              <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-4 w-4" />
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Torqvoice</span>
                            </div>
                          )}
                          <h3 className="text-xl font-bold uppercase" style={{ color: primaryColor }}>{t('title')}</h3>
                          <p className="mt-1 text-sm text-gray-500">{invoiceNum}</p>
                          <p className="text-sm text-gray-500">{serviceDate}</p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )

            case 'customer':
            case 'vehicle':
            case 'service': {
              const renderInfoCard = (sid: string) => {
                if (sid === 'customer') {
                  const c = record.vehicle.customer
                  if (!c) return null
                  const vf = getVisibleFieldsForSection(layoutConfig, 'customer')
                  const show = (fid: string) => !vf || vf.has(fid)
                  if (!(show('customer_name') || show('customer_email') || show('customer_phone') || show('customer_address') || show('customer_company'))) return null
                  const fieldOrder = getOrderedFieldIds(vf, ['customer_name', 'customer_company', 'customer_address', 'customer_email', 'customer_phone'])
                  const renderField = (fid: string) => {
                    if (!show(fid)) return null
                    switch (fid) {
                      case 'customer_name': return <p key={fid} className="font-semibold">{c.name}</p>
                      case 'customer_company': return c.company ? <p key={fid} className="text-sm">{c.company}</p> : null
                      case 'customer_address': return c.address ? <p key={fid} className="text-sm text-gray-500">{c.address}</p> : null
                      case 'customer_email': return c.email ? <p key={fid} className="text-sm text-gray-500">{c.email}</p> : null
                      case 'customer_phone': return c.phone ? <p key={fid} className="text-sm text-gray-500">{c.phone}</p> : null
                      default: return null
                    }
                  }
                  return (
                    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                      <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('billTo')}</p>
                      {fieldOrder.map(renderField)}
                      {getCustomFieldsForSection(layoutConfig ?? null, 'customer', customFields).map((cf, i) => (
                        <div key={`cf-cust-${i}`} className="mt-1 text-sm"><span className="font-medium">{cf.label}:</span>{' '}<span className="text-gray-500">{cf.value}</span></div>
                      ))}
                    </div>
                  );
                }
                if (sid === 'vehicle') {
                  const vf = getVisibleFieldsForSection(layoutConfig, 'vehicle')
                  const show = (fid: string) => !vf || vf.has(fid)
                  if (!(show('vehicle_name') || show('vin') || show('license_plate') || show('mileage'))) return null
                  const fieldOrder = getOrderedFieldIds(vf, ['vehicle_name', 'vin', 'license_plate', 'mileage'])
                  const renderField = (fid: string) => {
                    if (!show(fid)) return null
                    switch (fid) {
                      case 'vehicle_name': return <p key={fid} className="font-semibold">{vehicleName}</p>
                      case 'vin': return record.vehicle.vin ? <p key={fid} className="text-sm text-gray-500">{serviceType === 'marine' ? `HIN: ${record.vehicle.vin}` : t('vin', { vin: record.vehicle.vin })}</p> : null
                      case 'license_plate': return record.vehicle.licensePlate ? <p key={fid} className="text-sm text-gray-500">{serviceType === 'marine' ? `Reg: ${record.vehicle.licensePlate}` : t('plate', { plate: record.vehicle.licensePlate })}</p> : null
                      case 'mileage': return record.vehicle.mileage > 0 ? <p key={fid} className="text-sm text-gray-500">{serviceType === 'marine' ? `Engine Hours: ${record.vehicle.mileage.toLocaleString(locale)}` : record.vehicle.mileage.toLocaleString(locale)}</p> : null
                      default: return null
                    }
                  }
                  return (
                    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                      <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('vehicle')}</p>
                      {fieldOrder.map(renderField)}
                      {getCustomFieldsForSection(layoutConfig ?? null, 'vehicle', customFields).map((cf, i) => (
                        <div key={`cf-veh-${i}`} className="mt-1 text-sm"><span className="font-medium">{cf.label}:</span>{' '}<span className="text-gray-500">{cf.value}</span></div>
                      ))}
                    </div>
                  );
                }
                if (sid === 'service') {
                  const vf = getVisibleFieldsForSection(layoutConfig, 'service')
                  const show = (fid: string) => !vf || vf.has(fid)
                  if (!(show('service_title') || show('service_type') || show('tech_name'))) return null
                  const fieldOrder = getOrderedFieldIds(vf, ['service_title', 'service_type', 'tech_name'])
                  const renderField = (fid: string) => {
                    if (!show(fid)) return null
                    switch (fid) {
                      case 'service_title': return <p key={fid} className="font-semibold">{record.title}</p>
                      case 'service_type': return <p key={fid} className="text-sm text-gray-500">{t('type', { type: record.type })}</p>
                      case 'tech_name': return record.techName ? <p key={fid} className="text-sm text-gray-500">{t('tech', { tech: record.techName })}</p> : null
                      default: return null
                    }
                  }
                  return (
                    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                      <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('service')}</p>
                      {fieldOrder.map(renderField)}
                      {getCustomFieldsForSection(layoutConfig ?? null, 'service', customFields).map((cf, i) => (
                        <div key={`cf-svc-${i}`} className="mt-1 text-sm"><span className="font-medium">{cf.label}:</span>{' '}<span className="text-gray-500">{cf.value}</span></div>
                      ))}
                    </div>
                  );
                }
                return null;
              };

              const colGroup = columnGroupMap.get(sectionId);
              if (colGroup) {
                return (
                  <div key={`col-${sectionId}`} className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-4">{colGroup.left.map(id => <React.Fragment key={id}>{renderInfoCard(id)}</React.Fragment>)}</div>
                    <div className="space-y-4">{colGroup.right.map(id => <React.Fragment key={id}>{renderInfoCard(id)}</React.Fragment>)}</div>
                  </div>
                );
              }
              return <div key={sectionId} className="mt-6">{renderInfoCard(sectionId)}</div>;
            }

            case 'parts_table':
              if (record.partItems.length === 0) return null
              return (
                <div key="parts_table" className="mt-6">
                  <h4 className="mb-3 font-semibold">{t('parts')}</h4>
                  <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
                    <table className="w-full min-w-125 text-sm">
                      <thead>
                        <tr className="border-b text-left" style={{ backgroundColor: `${primaryColor}15` }}>
                          <th className="p-2 font-medium">{t('partNumber')}</th>
                          <th className="p-2 font-medium">{t('description')}</th>
                          <th className="p-2 text-right font-medium">{t('qty')}</th>
                          <th className="p-2 text-right font-medium">{t('unitPrice')}</th>
                          <th className="p-2 text-right font-medium">{t('total')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {record.partItems.map((p, i) => (
                          <tr key={i}>
                            <td className="p-2 font-mono text-xs">{p.partNumber || '-'}</td>
                            <td className="p-2">{p.name}</td>
                            <td className="p-2 text-right">{p.quantity}</td>
                            <td className="p-2 text-right">
                              {formatCurrency(p.unitPrice, currencyCode)}
                            </td>
                            <td className="p-2 text-right font-medium">
                              {formatCurrency(p.total, currencyCode)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )

            case 'labor_table':
              if (record.laborItems.length === 0) return null
              return (
                <div key="labor_table" className="mt-6">
                  <h4 className="mb-3 font-semibold">{t('labor')}</h4>
                  <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
                    <table className="w-full min-w-112.5 text-sm">
                      <thead>
                        <tr className="border-b text-left" style={{ backgroundColor: `${primaryColor}15` }}>
                          <th className="p-2 font-medium">{t('description')}</th>
                          <th className="p-2 text-right font-medium">{t('qtyOrHours')}</th>
                          <th className="p-2 text-right font-medium">{t('rate')}</th>
                          <th className="p-2 text-right font-medium">{t('total')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {record.laborItems.map((l, i) => (
                          <tr key={i}>
                            <td className="p-2">{l.description}</td>
                            <td className="p-2 text-right">{l.pricingType === 'service' ? `${l.hours} ${t('unit')}` : `${l.hours} ${t('hrs')}`}</td>
                            <td className="p-2 text-right">{l.pricingType === 'service' ? formatCurrency(l.rate, currencyCode) : t('ratePerHour', { rate: formatCurrency(l.rate, currencyCode) })}</td>
                            <td className="p-2 text-right font-medium">
                              {formatCurrency(l.total, currencyCode)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )

            case 'totals':
              return (
                <div key="totals">
                  <div className="mt-6 ml-auto max-w-xs space-y-2">
                    {partsSubtotal > 0 && laborSubtotal > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{t('parts')}</span>
                          <span>{formatCurrency(partsSubtotal, currencyCode)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{t('labor')}</span>
                          <span>{formatCurrency(laborSubtotal, currencyCode)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">{t('subtotal')}</span>
                          <span>{formatCurrency(computedSubtotal, currencyCode)}</span>
                        </div>
                      </>
                    )}
                    {record.discountAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">
                          {record.discountType === 'percentage' ? t('discountPercent', { percent: record.discountValue }) : t('discount')}
                        </span>
                        <span className="text-red-500">
                          {formatCurrency(-record.discountAmount, currencyCode)}
                        </span>
                      </div>
                    )}
                    {record.taxRate > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{t('tax', { rate: record.taxRate })}</span>
                        <span>{formatCurrency(record.taxAmount, currencyCode)}</span>
                      </div>
                    )}
                    <div
                      className={`border-t pt-2 ${totalPaid > 0 ? 'border-gray-200' : ''}`}
                      style={totalPaid > 0 ? undefined : { borderColor: primaryColor }}
                    >
                      <div
                        className={`flex justify-between ${totalPaid > 0 ? 'text-sm text-gray-500' : 'text-lg font-bold'}`}
                      >
                        <span>{t('total')}</span>
                        <span style={totalPaid > 0 ? undefined : { color: primaryColor }}>
                          {formatCurrency(displayTotal, currencyCode)}
                        </span>
                      </div>
                    </div>
                    {totalPaid > 0 && (
                      <>
                        <div className="flex justify-between text-sm text-emerald-600">
                          <span>{t('paid')}</span>
                          <span>{formatCurrency(-totalPaid, currencyCode)}</span>
                        </div>
                        {balanceDue <= 0 ? (
                          <div className="rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
                            <div className="flex items-center justify-between gap-2 text-lg font-bold text-emerald-600">
                              <span className="whitespace-nowrap">{t('balanceDue')}</span>
                              <span className="whitespace-nowrap">{t('paidInFull')}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-amber-50 px-4 py-3 ring-2 ring-amber-400 dark:bg-amber-900/20 dark:ring-amber-600">
                            <div className="flex items-center justify-between gap-2 text-lg font-bold">
                              <span className="whitespace-nowrap">{t('amountDue')}</span>
                              <span className="text-amber-700 dark:text-amber-400">
                                {formatCurrency(balanceDue, currencyCode)}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Torqvoice branding near totals */}
                  {showTorqvoiceBranding && (
                    <div className="mt-3 flex items-center justify-end gap-1.5">
                      <span className="text-xs text-gray-400">{tc('poweredBy')}</span>
                      <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Torqvoice</span>
                    </div>
                  )}
                </div>
              )

            case 'general': {
              const generalCfs = layoutConfig
                ? getCustomFieldsForSection(layoutConfig, 'general', customFields)
                : getUnassignedCustomFields(null, customFields)
              if (generalCfs.length === 0) return null
              return (
                <div key="general" className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                  <p className="mb-2 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('customFields', { defaultValue: 'Additional Information' })}</p>
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    {generalCfs.map((cf, i) => (
                      <div key={i}>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{cf.label}</p>
                        <p className="font-medium">{cf.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            case 'notes':
              if (!hasContent(record.invoiceNotes)) return null
              return (
                <div key="notes" className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                  <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('notes')}</p>
                  <div
                    className="notes-content text-sm text-gray-600 dark:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.invoiceNotes!) }}
                  />
                </div>
              )

            case 'diagnostic_notes':
              if (!hasContent(record.diagnosticNotes)) return null
              return (
                <div key="diagnostic_notes" className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                  <p className="mb-1 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('diagnosticNotes')}</p>
                  <div
                    className="notes-content text-sm text-gray-600 dark:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.diagnosticNotes!) }}
                  />
                </div>
              )

            case 'findings':
              if (!findings || findings.length === 0) return null
              return (
                <div key="findings" className="mt-6">
                  <h4 className="mb-1 font-semibold">{t('findings', { defaultValue: 'Findings' })}</h4>
                  <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('findingsDescription', { defaultValue: 'The following items were observed during this service and may require attention.' })}</p>
                  <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left" style={{ backgroundColor: `${primaryColor}15` }}>
                          <th className="w-[15%] p-2 font-medium">{t('severity', { defaultValue: 'Severity' })}</th>
                          <th className="w-[40%] p-2 font-medium">{t('description')}</th>
                          <th className="p-2 font-medium">{t('findingNotes', { defaultValue: 'Notes' })}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {findings.map((f, i) => {
                          const severityColor = f.severity === 'urgent' ? 'text-red-600 dark:text-red-400' : f.severity === 'needs_work' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
                          const severityLabel = f.severity === 'urgent' ? t('findingSeverityUrgent', { defaultValue: 'Urgent' }) : f.severity === 'needs_work' ? t('findingSeverityNeedsWork', { defaultValue: 'Needs Work' }) : t('findingSeverityMonitor', { defaultValue: 'Monitor' })
                          return (
                            <tr key={i}>
                              <td className="p-2">
                                <span className={`text-xs font-semibold uppercase ${severityColor}`}>{severityLabel}</span>
                              </td>
                              <td className="p-2">{f.description}</td>
                              <td className="p-2 text-gray-500 dark:text-gray-400">{f.notes || '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )

            case 'bank_account': {
              const effectiveShowBankAccount = layoutConfig
                ? isFieldVisible(layoutConfig, 'bank_account', 'bank_account')
                : invoiceSettings?.showBankAccount ?? true
              const effectiveShowOrgNumber = layoutConfig
                ? isFieldVisible(layoutConfig, 'bank_account', 'org_number')
                : invoiceSettings?.showOrgNumber ?? true
              if (!invoiceSettings || (!invoiceSettings.bankAccount && !invoiceSettings.orgNumber && !invoiceSettings.paymentTerms)) return null
              return (
                <div key="bank_account" className="mt-6 rounded-lg border p-4" style={{ borderColor: `${primaryColor}40`, backgroundColor: `${primaryColor}08` }}>
                  <p className="mb-2 text-xs font-bold uppercase" style={{ color: primaryColor }}>{t('paymentInformation')}</p>
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    {effectiveShowBankAccount && invoiceSettings.bankAccount && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('bankAccount')}</p>
                        <p className="font-medium">{invoiceSettings.bankAccount}</p>
                      </div>
                    )}
                    {effectiveShowOrgNumber && invoiceSettings.orgNumber && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('orgNumber')}</p>
                        <p className="font-medium">{invoiceSettings.orgNumber}</p>
                      </div>
                    )}
                    {(() => {
                      const dueDate = record.invoiceDueDate
                        ? new Date(record.invoiceDueDate)
                        : invoiceSettings.dueDays > 0
                          ? new Date(new Date(effectiveInvoiceDate).getTime() + invoiceSettings.dueDays * 86400000)
                          : null
                      const netDays = dueDate
                        ? Math.ceil((dueDate.getTime() - new Date(effectiveInvoiceDate).getTime()) / 86400000)
                        : null
                      return netDays !== null && netDays > 0 ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{t('paymentTerms')}</p>
                          <p className="font-medium">Net {netDays} Days</p>
                        </div>
                      ) : invoiceSettings.paymentTerms ? (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{t('paymentTerms')}</p>
                          <p className="font-medium">{invoiceSettings.paymentTerms}</p>
                        </div>
                      ) : null
                    })()}
                    {(record.invoiceDueDate || invoiceSettings.dueDays > 0) && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('dueDate')}</p>
                        <p className="font-medium">
                          {fmtDate(
                            record.invoiceDueDate
                              ? new Date(record.invoiceDueDate)
                              : new Date(
                                  new Date(effectiveInvoiceDate).getTime() + invoiceSettings.dueDays * 86400000
                                ),
                            df,
                            tz,
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            case 'telegram_qr':
              if (!telegramBotLink) return null
              return (
                <div key="telegram_qr" className="mt-4 border-t pt-4 flex flex-col items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{tc('telegramConnect')}</p>
                  <div className="rounded-lg bg-white p-2">
                    <QRCodeSVG value={telegramBotLink} size={100} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">{tc('telegramScan')}</p>
                </div>
              )

            case 'footer':
              if (!invoiceSettings?.footerNote) return null
              return (
                <div key="footer" className="mt-4 border-t pt-4">
                  <p className="whitespace-pre-wrap text-center text-xs text-gray-500 dark:text-gray-400">
                    {invoiceSettings.footerNote}
                  </p>
                </div>
              )

            default:
              return null
          }
        });
        })()}

        {/* Service Images (not part of layout config sections) */}
        {imageAttachments.length > 0 && (
          <div className="mt-6">
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
            <div className="mt-6">
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
              <div className="mt-6">
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
            {tc('portalMessage')}{" "}
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
          <p className="text-center text-xs text-gray-400">
            {shopName}
          </p>
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
