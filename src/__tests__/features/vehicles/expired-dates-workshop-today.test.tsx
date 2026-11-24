/**
 * The expired-dates prompt before an invoice goes out. "Today" is the
 * workshop's day: it used to be the UTC day, so at 05:00 in Auckland
 * "Update to today's date" wrote yesterday (24/11, due 08/12) and, west of
 * UTC, an invoice dated earlier today read as expired in the evening.
 */
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateSettingsProvider } from '@/components/date-settings-context'

const membership = vi.hoisted(() => ({ value: null as unknown }))
const { updateServiceRecord, handleDownloadPDF } = vi.hoisted(() => ({
  updateServiceRecord: vi.fn(async (_data: unknown) => ({ success: true })),
  handleDownloadPDF: vi.fn(),
}))

vi.mock('@/lib/cached-session', () => ({
  getCachedMembership: async () => membership.value,
}))
vi.mock('@/features/inspections/Components/NewInspectionDialog', () => ({
  NewInspectionDialog: () => null,
}))

const deleteFinding = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/vehicles/Actions/findingActions', () => ({
  deleteFinding: (id: string) => deleteFinding(id),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  updateServiceRecordTitle: vi.fn(),
  updateServiceStatus: vi.fn(),
  updateServiceRecord: (data: unknown) => updateServiceRecord(data),
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/email/Actions/emailActions', () => ({ sendInvoiceEmail: vi.fn() }))
vi.mock('@/features/settings/Actions/documentLockActions', () => ({
  setInvoiceEditUnlocked: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/lookupPartByBarcode', () => ({
  lookupPartByBarcode: vi.fn(),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({ getSmsTemplates: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/hooks/use-hardware-scanner', () => ({ useHardwareScanner: () => undefined }))
vi.mock('@/hooks/use-save-shortcut', () => ({ useSaveShortcut: () => undefined }))
vi.mock('@/features/realtime/hooks', () => ({ useLiveRecord: () => undefined }))

const { passThrough } = vi.hoisted(() => ({
  passThrough: ({ children }: { children?: React.ReactNode }) => children,
}))
vi.mock('@/features/settings/Components/ShopFeeContext', () => ({ ShopFeeProvider: passThrough }))
vi.mock('@/features/settings/Components/LineTaxContext', () => ({ LineTaxProvider: passThrough }))
vi.mock('@/features/settings/Components/WorkshopTaxOffer', () => ({
  useTaxOfferValue: () => null,
  WorkshopTaxOfferProvider: passThrough,
}))
vi.mock('@/features/fault-codes/Components/FaultCodesOnJob', () => ({
  FaultCodesJobProvider: passThrough,
}))
vi.mock('@/components/document-lock-banner', () => ({ DocumentLockBanner: () => null }))
vi.mock('@/features/vehicles/Components/service-page/InvoiceDesignMenu', () => ({
  InvoiceDesignMenu: () => null,
}))
vi.mock('@/features/vehicles/Components/service-page/PayCodeButton', () => ({
  PayCodeButton: () => null,
}))
vi.mock('@/features/messaging/Components/SendDocumentDialog', () => ({
  SendDocumentDialog: () => null,
}))
vi.mock('@/features/vehicles/Components/service-detail/ImageCarousel', () => ({
  ImageCarousel: () => null,
}))
vi.mock('@/features/vehicles/Components/service-detail/ShareDialog', () => ({
  ShareDialog: () => null,
}))
vi.mock('@/components/notify-customer-dialog', () => ({ NotifyCustomerDialog: () => null }))
vi.mock('@/components/pdf-preview-dialog', () => ({ PdfPreviewDialog: () => null }))
vi.mock('@/features/vehicles/Components/service-edit/InventoryPickerDialog', () => ({
  InventoryPickerDialog: () => null,
}))
vi.mock('@/components/barcode-scanner-dialog', () => ({ BarcodeScannerDialog: () => null }))
vi.mock('@/features/labor-presets/Components/LaborPresetPickerDialog', () => ({
  LaborPresetPickerDialog: () => null,
}))
vi.mock('@/features/status-reports/Components/StatusReportList', () => ({
  StatusReportList: () => null,
}))
/** The header's Download PDF, which asks about expired dates first. */
vi.mock('@/features/vehicles/Components/service-page/ServiceHeaderActions', () => ({
  ServiceHeaderActions: ({ onDownloadPDF }: { onDownloadPDF: () => void }) => (
    <button type="button" onClick={onDownloadPDF}>
      Download PDF
    </button>
  ),
}))
vi.mock('@/features/vehicles/Components/service-page/LaborAddedBanner', () => ({
  LaborAddedBanner: () => null,
}))
vi.mock('@/features/vehicles/Components/service-page/LeaveUnsavedDialog', () => ({
  LeaveUnsavedDialog: () => null,
}))
vi.mock('@/features/realtime/Components/PresenceChips', () => ({ PresenceChips: () => null }))

type Line = { description: string }

vi.mock('@/features/vehicles/Components/service-page/modern/ModernDetails', () => ({
  ModernDetails: () => null,
}))
vi.mock('@/features/vehicles/Components/service-page/ObservationsManager', () => ({
  ObservationsManager: () => null,
}))

/** The form state, with real lines and nothing else the page needs here. */
vi.mock('@/features/vehicles/Components/service-page/useServiceFormState', () => ({
  useServiceFormState: () => {
    const [laborItems, setLaborItems] = useState<Line[]>([])
    return {
      laborItems,
      dirtySetLaborItems: setLaborItems,
      dirtySetPartItems: vi.fn(),
      dirtySetType: vi.fn(),
      concerns: [],
      status: 'pending',
      paymentStatus: 'unpaid',
      taxRate: 0,
      type: 'repair',
      warranty: { warrantyStatus: 'none' },
      vehicleName: '2019 Volvo V70',
      hasUnsavedChanges: false,
      isDirty: () => false,
      loading: false,
      showSaved: false,
      balanceDue: 0,
      formRef: { current: null },
      blockedLeave: null,
      laborAddedElsewhere: [],
      partsAddedElsewhere: [],
      changedElsewhere: { kept: [], replaced: [] },
      dismissChangedElsewhere: vi.fn(),
      imageAttachments: [],
      showPresetPicker: false,
      showInventoryPicker: false,
      showBarcodeScanner: false,
      setShowPresetPicker: vi.fn(),
      setShowInventoryPicker: vi.fn(),
      setShowBarcodeScanner: vi.fn(),
      setStatus: vi.fn(),
      markDirty: vi.fn(),
      flashSaved: vi.fn(),
      saveNow: vi.fn(),
      stayOnPage: vi.fn(),
      leaveWithoutSaving: vi.fn(),
      applyLaborAddedElsewhere: vi.fn(),
      applyPartsAddedElsewhere: vi.fn(),
    }
  },
}))
vi.mock('@/features/vehicles/Components/service-page/useServiceActions', () => ({
  useServiceActions: () => ({
    carouselIndex: null,
    setCarouselIndex: vi.fn(),
    downloading: false,
    handleDelete: vi.fn(),
    handleDownloadPDF: () => handleDownloadPDF(),
    handleSubmit: vi.fn(),
    saveNow: vi.fn(),
    paymentNotifyMessage: '',
    showPaymentNotifyDialog: false,
    setShowPaymentNotifyDialog: vi.fn(),
    showEmailDialog: false,
    setShowEmailDialog: vi.fn(),
    showShareDialog: false,
    setShowShareDialog: vi.fn(),
  }),
}))

import { ServicePageClient } from '@/features/vehicles/Components/service-page/ServicePageClient'

// The browser is in London; the workshops are not.
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/London'
})
afterAll(() => {
  process.env.TZ = originalTz
})
beforeEach(() => {
  updateServiceRecord.mockClear()
  handleDownloadPDF.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

function renderPage({
  zone,
  now,
  invoiceDate,
  invoiceDueDate,
}: {
  zone: string
  now: string
  invoiceDate: string
  invoiceDueDate: string
}) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(now))
  const props = {
    record: {
      id: 'job1',
      title: 'Annual service',
      invoiceNumber: 'WO-1001',
      customer: null,
      vehicle: { id: 'v1', year: 2019, make: 'Volvo', model: 'V70', customer: null },
      publicToken: null,
    },
    vehicleId: 'v1',
    organizationId: 'org1',
    lockState: { locked: false, unlockedAt: null },
    canUnlock: false,
    canTakePayment: true,
    currencyCode: 'NZD',
    unitSystem: 'metric',
    defaultDueDays: 14,
    initialData: { invoiceDate, invoiceDueDate },
    openObservations: [],
  }
  // Only what this part of the page reads is given.
  render(
    <DateSettingsProvider dateFormat="dd/MM/yyyy" timeFormat="24h" timezone={zone}>
      <ServicePageClient {...(props as unknown as Parameters<typeof ServicePageClient>[0])} />
    </DateSettingsProvider>
  )
}

async function download() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
  })
}

async function updateToToday() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: "Update to today's date" }))
  })
  return updateServiceRecord.mock.calls[0]?.[0]
}

describe('the expired dates prompt in Auckland at 05:00 on 25 November (16:00 UTC on the 24th)', () => {
  const auckland = { zone: 'Pacific/Auckland', now: '2026-11-24T16:00:00Z' }

  it("calls yesterday's invoice date expired and moves it to the workshop's today", async () => {
    renderPage({ ...auckland, invoiceDate: '2026-11-24', invoiceDueDate: '2026-12-08' })
    await download()
    expect(screen.getByText('Invoice Dates Expired')).toBeInTheDocument()
    expect(await updateToToday()).toEqual({
      id: 'job1',
      invoiceDate: '2026-11-25',
      invoiceDueDate: '2026-12-09',
    })
    expect(handleDownloadPDF).toHaveBeenCalled()
  })

  it("does not ask about an invoice dated the workshop's today", async () => {
    renderPage({ ...auckland, invoiceDate: '2026-11-25', invoiceDueDate: '2026-12-09' })
    await download()
    expect(screen.queryByText('Invoice Dates Expired')).toBeNull()
    expect(handleDownloadPDF).toHaveBeenCalled()
  })
})

describe('the expired dates prompt in Los Angeles at 22:00 on 24 November (06:00 UTC on the 25th)', () => {
  const losAngeles = { zone: 'America/Los_Angeles', now: '2026-11-25T06:00:00Z' }

  it('does not call an invoice dated earlier today expired', async () => {
    renderPage({ ...losAngeles, invoiceDate: '2026-11-24', invoiceDueDate: '2026-12-08' })
    await download()
    expect(screen.queryByText('Invoice Dates Expired')).toBeNull()
    expect(handleDownloadPDF).toHaveBeenCalled()
  })

  it("moves an old invoice to the workshop's today, not the UTC one", async () => {
    renderPage({ ...losAngeles, invoiceDate: '2026-11-20', invoiceDueDate: '2026-11-23' })
    await download()
    expect(await updateToToday()).toEqual({
      id: 'job1',
      invoiceDate: '2026-11-24',
      invoiceDueDate: '2026-12-08',
    })
  })
})
