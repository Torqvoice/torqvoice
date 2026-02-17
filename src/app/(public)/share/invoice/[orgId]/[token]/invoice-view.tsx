'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { formatCurrency, formatDate as fmtDate, DEFAULT_DATE_FORMAT } from '@/lib/format'

interface InvoiceRecord {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  serviceDate: Date
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
}) {
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState<{ amount: number } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [customAmount, setCustomAmount] = useState(false)

  const vehicleName = `${record.vehicle.year} ${record.vehicle.make} ${record.vehicle.model}`
  const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
  const invoiceNum = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`
  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const serviceDate = fmtDate(record.serviceDate, df, tz)
  const totalPaid = record.payments.reduce((sum, p) => sum + p.amount, 0)
  const balanceDue = displayTotal - totalPaid
  const shopName = workshop.name || record.shopName || 'Torqvoice'

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
        const res = await fetch(`/api/share/invoice/${orgId}/${token}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, externalId }),
        })
        const data = await res.json()
        if (data.verified) {
          setPaymentSuccess({ amount: data.amount })
        } else {
          setPaymentError('Payment could not be verified. It may still be processing.')
        }
      } catch {
        setPaymentError('Failed to verify payment status.')
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
    const res = await fetch(`/api/share/invoice/${orgId}/${token}/pdf`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoiceNum}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePayment = async (provider: string) => {
    setPaymentError(null)
    const amount = Number.parseFloat(paymentAmount)
    if (Number.isNaN(amount) || amount < 0.01) {
      setPaymentError('Please enter a valid amount.')
      return
    }
    if (amount > balanceDue + 0.01) {
      setPaymentError(`Amount cannot exceed ${formatCurrency(balanceDue, currencyCode)}.`)
      return
    }

    setPaymentLoading(provider)
    try {
      const res = await fetch(`/api/share/invoice/${orgId}/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPaymentError(data.error || 'Failed to start checkout.')
        return
      }
      window.location.href = data.redirectUrl
    } catch {
      setPaymentError('Failed to initiate payment. Please try again.')
    } finally {
      setPaymentLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoice</h1>
        <button
          onClick={handleDownloadPDF}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          <Download className="h-4 w-4" />
          Download PDF
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
            Payment received!
          </p>
          <p className="text-sm text-emerald-600 dark:text-emerald-500">
            {formatCurrency(paymentSuccess.amount, currencyCode)} has been applied to this invoice.
          </p>
        </div>
      )}

      {/* Verifying Banner */}
      {verifying && (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border bg-gray-50 p-5 shadow-sm dark:bg-gray-800">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <span className="font-medium">Verifying payment...</span>
        </div>
      )}

      {/* Pay Invoice Banner — top of page */}
      {showPaymentSection && !verifying && (
        <div className="mb-6 overflow-hidden rounded-xl border shadow-sm">
          <div className="bg-linear-to-r from-amber-500 to-amber-600 px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <CreditCard className="h-4 w-4" />
                <span className="text-sm font-semibold">Balance Due</span>
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
                  Full amount
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
                  Partial payment
                </button>
              </div>
              {customAmount && (
                <div className="mt-3">
                  <label
                    htmlFor="payAmount"
                    className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Enter amount
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
                  Pay {formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode)} with
                  Card
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
                  Pay {formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode)} with
                  Vipps
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
                  Pay {formatCurrency(Number.parseFloat(paymentAmount) || 0, currencyCode)} with
                  PayPal
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8 dark:bg-gray-900">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b-2 border-amber-500 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {showLogo && logoUrl && (
              <img
                src={logoUrl}
                alt={shopName}
                className="mb-2 max-h-16 max-w-[180px] object-contain object-left"
              />
            )}
            {showCompanyName && (
              <h2 className="text-xl font-bold text-amber-600 sm:text-2xl">{shopName}</h2>
            )}
            {workshop.address && <p className="mt-1 text-sm text-gray-500">{workshop.address}</p>}
            {workshop.phone && <p className="text-sm text-gray-500">Tel: {workshop.phone}</p>}
            {workshop.email && <p className="text-sm text-gray-500">{workshop.email}</p>}
          </div>
          <div className="sm:text-right">
            {showTorqvoiceBranding && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-4 w-4" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Torqvoice</span>
              </div>
            )}
            <h3 className="text-xl font-bold">INVOICE</h3>
            <p className="mt-1 text-sm text-gray-500">{invoiceNum}</p>
            <p className="text-sm text-gray-500">{serviceDate}</p>
          </div>
        </div>

        {/* Info Boxes */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {record.vehicle.customer && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
              <p className="mb-1 text-xs font-bold uppercase text-amber-600">Bill To</p>
              <p className="font-semibold">{record.vehicle.customer.name}</p>
              {record.vehicle.customer.company && (
                <p className="text-sm">{record.vehicle.customer.company}</p>
              )}
              {record.vehicle.customer.address && (
                <p className="text-sm text-gray-500">{record.vehicle.customer.address}</p>
              )}
              {record.vehicle.customer.email && (
                <p className="text-sm text-gray-500">{record.vehicle.customer.email}</p>
              )}
              {record.vehicle.customer.phone && (
                <p className="text-sm text-gray-500">{record.vehicle.customer.phone}</p>
              )}
            </div>
          )}
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <p className="mb-1 text-xs font-bold uppercase text-amber-600">Vehicle</p>
            <p className="font-semibold">{vehicleName}</p>
            {record.vehicle.vin && (
              <p className="text-sm text-gray-500">VIN: {record.vehicle.vin}</p>
            )}
            {record.vehicle.licensePlate && (
              <p className="text-sm text-gray-500">Plate: {record.vehicle.licensePlate}</p>
            )}
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <p className="mb-1 text-xs font-bold uppercase text-amber-600">Service</p>
            <p className="font-semibold">{record.title}</p>
            <p className="text-sm text-gray-500">Type: {record.type}</p>
            {record.techName && <p className="text-sm text-gray-500">Tech: {record.techName}</p>}
          </div>
        </div>

        {/* Parts */}
        {record.partItems.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-semibold">Parts</h4>
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <table className="w-full min-w-125 text-sm">
                <thead>
                  <tr className="border-b bg-amber-50 text-left dark:bg-amber-900/20">
                    <th className="p-2 font-medium">Part #</th>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 text-right font-medium">Qty</th>
                    <th className="p-2 text-right font-medium">Unit Price</th>
                    <th className="p-2 text-right font-medium">Total</th>
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
        )}

        {/* Labor */}
        {record.laborItems.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-semibold">Labor</h4>
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <table className="w-full min-w-112.5 text-sm">
                <thead>
                  <tr className="border-b bg-amber-50 text-left dark:bg-amber-900/20">
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 text-right font-medium">Hours</th>
                    <th className="p-2 text-right font-medium">Rate</th>
                    <th className="p-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {record.laborItems.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2">{l.description}</td>
                      <td className="p-2 text-right">{l.hours}</td>
                      <td className="p-2 text-right">{formatCurrency(l.rate, currencyCode)}/hr</td>
                      <td className="p-2 text-right font-medium">
                        {formatCurrency(l.total, currencyCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-2">
          {record.subtotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatCurrency(record.subtotal, currencyCode)}</span>
            </div>
          )}
          {record.discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                Discount{record.discountType === 'percentage' ? ` (${record.discountValue}%)` : ''}
              </span>
              <span className="text-red-500">
                {formatCurrency(-record.discountAmount, currencyCode)}
              </span>
            </div>
          )}
          {record.taxRate > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax ({record.taxRate}%)</span>
              <span>{formatCurrency(record.taxAmount, currencyCode)}</span>
            </div>
          )}
          <div
            className={`border-t pt-2 ${totalPaid > 0 ? 'border-gray-200' : 'border-amber-500'}`}
          >
            <div
              className={`flex justify-between ${totalPaid > 0 ? 'text-sm text-gray-500' : 'text-lg font-bold'}`}
            >
              <span>Total</span>
              <span className={totalPaid > 0 ? '' : 'text-amber-600'}>
                {formatCurrency(displayTotal, currencyCode)}
              </span>
            </div>
          </div>
          {totalPaid > 0 && (
            <>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Paid</span>
                <span>{formatCurrency(-totalPaid, currencyCode)}</span>
              </div>
              {balanceDue <= 0 ? (
                <div className="rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
                  <div className="flex justify-between text-lg font-bold text-emerald-600">
                    <span>Balance Due</span>
                    <span>PAID IN FULL</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 px-4 py-3 ring-2 ring-amber-400 dark:bg-amber-900/20 dark:ring-amber-600">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Amount Due</span>
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
            <span className="text-xs text-gray-400">Powered by</span>
            <img src="/torqvoice_app_logo.png" alt="Torqvoice" className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Torqvoice</span>
          </div>
        )}

        {/* Payment Information */}
        {invoiceSettings &&
          (invoiceSettings.bankAccount ||
            invoiceSettings.orgNumber ||
            invoiceSettings.paymentTerms) && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
              <p className="mb-2 text-xs font-bold uppercase text-amber-600">Payment Information</p>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {invoiceSettings.showBankAccount && invoiceSettings.bankAccount && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Bank Account</p>
                    <p className="font-medium">{invoiceSettings.bankAccount}</p>
                  </div>
                )}
                {invoiceSettings.showOrgNumber && invoiceSettings.orgNumber && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Org. Number</p>
                    <p className="font-medium">{invoiceSettings.orgNumber}</p>
                  </div>
                )}
                {invoiceSettings.paymentTerms && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Payment Terms</p>
                    <p className="font-medium">{invoiceSettings.paymentTerms}</p>
                  </div>
                )}
                {invoiceSettings.dueDays > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Due Date</p>
                    <p className="font-medium">
                      {fmtDate(
                        new Date(
                          new Date(record.serviceDate).getTime() + invoiceSettings.dueDays * 86400000
                        ),
                        df,
                        tz,
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Service Images */}
        {imageAttachments.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 flex items-center gap-2 font-semibold">
              <Camera className="h-4 w-4" />
              Service Images ({imageAttachments.length})
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
                Service Videos ({videoAttachments.length})
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
                  Diagnostic Reports ({reports.length})
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

        {/* Notes */}
        {record.invoiceNotes && (
          <div className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <p className="mb-1 text-xs font-bold uppercase text-amber-600">Notes</p>
            <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
              {record.invoiceNotes}
            </p>
          </div>
        )}
        {record.diagnosticNotes && (
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <p className="mb-1 text-xs font-bold uppercase text-amber-600">Diagnostic Notes</p>
            <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
              {record.diagnosticNotes}
            </p>
          </div>
        )}
        {invoiceSettings?.footerNote && (
          <div className="mt-4 border-t pt-4">
            <p className="whitespace-pre-wrap text-center text-xs text-gray-500 dark:text-gray-400">
              {invoiceSettings.footerNote}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col items-center gap-1">
        {showTorqvoiceBranding ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-400">Powered by</span>
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
            Terms of Sale
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
