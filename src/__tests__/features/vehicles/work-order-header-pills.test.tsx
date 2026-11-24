/**
 * The pills in the work order header. People clicked the status pill and the
 * payment pill and nothing happened: they sat in the same outlined box as the
 * type dropdown beside them. Now "Unpaid" (and "Partial") is the page's own
 * "Take payment" for somebody who may record a payment, and every pill that
 * does nothing has lost the outline and the hand cursor. A locked invoice and
 * somebody without billing rights gain no control.
 *
 * The status pill stays read only: its menus belong to the status stepper.
 */
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const paymentStatus = vi.hoisted(() => ({ value: 'unpaid' }))
const membership = vi.hoisted(() => ({ value: null as unknown }))

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
  updateServiceRecord: vi.fn(),
}))
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
vi.mock('@/features/vehicles/Components/service-page/ServiceHeaderActions', () => ({
  ServiceHeaderActions: () => null,
}))
vi.mock('@/features/vehicles/Components/service-page/LaborAddedBanner', () => ({
  LaborAddedBanner: () => null,
}))
vi.mock('@/features/vehicles/Components/service-page/LeaveUnsavedDialog', () => ({
  LeaveUnsavedDialog: () => null,
}))
vi.mock('@/features/realtime/Components/PresenceChips', () => ({ PresenceChips: () => null }))

type Line = { description: string }

/** The payments form's signal, as the details hand it to the payments section. */
vi.mock('@/features/vehicles/Components/service-page/modern/ModernDetails', () => ({
  ModernDetails: ({ paymentSignal }: { paymentSignal: number }) => (
    <output data-testid="payment-form-opened">{paymentSignal}</output>
  ),
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
      paymentStatus: paymentStatus.value,
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
    handleDownloadPDF: vi.fn(),
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
import { canTakePayments } from '@/lib/billing-access'

function renderPage({
  canTakePayment = true,
  locked = false,
}: {
  canTakePayment?: boolean
  locked?: boolean
} = {}) {
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
    lockState: { locked, unlockedAt: null },
    canUnlock: false,
    canTakePayment,
    currencyCode: 'NOK',
    unitSystem: 'metric',
    initialData: { invoiceDate: null, invoiceDueDate: null },
    openObservations: [],
  }
  // Only what this part of the page reads is given.
  render(<ServicePageClient {...(props as unknown as Parameters<typeof ServicePageClient>[0])} />)
}

const opened = () => screen.getByTestId('payment-form-opened').textContent

describe('the payment pill in the work order header', () => {
  beforeEach(() => {
    paymentStatus.value = 'unpaid'
  })

  it('opens the payment form when the job is unpaid and the viewer may take payments', async () => {
    renderPage()
    const pill = screen.getByRole('button', { name: 'Unpaid: Take payment' })
    expect(opened()).toBe('0')

    await act(async () => {
      fireEvent.click(pill)
    })

    expect(opened()).toBe('1')
  })

  it('does the same for a job paid in part, which still has a balance', () => {
    paymentStatus.value = 'partial'
    renderPage()
    expect(screen.getByRole('button', { name: 'Partial: Take payment' })).toBeTruthy()
  })

  it('only reads for somebody who may not record a payment', () => {
    renderPage({ canTakePayment: false })
    expect(screen.queryByRole('button', { name: /Take payment/ })).toBeNull()
    expect(screen.getByTestId('service-payment').tagName).toBe('SPAN')
    expect(screen.getByTestId('service-payment').textContent).toBe('Unpaid')
  })

  it('only reads once the job is paid', () => {
    paymentStatus.value = 'paid'
    renderPage()
    expect(screen.queryByRole('button', { name: /Take payment/ })).toBeNull()
    expect(screen.getByTestId('service-payment').tagName).toBe('SPAN')
    expect(screen.getByTestId('service-payment').textContent).toBe('Paid')
  })

  it('offers nothing on a locked invoice', () => {
    renderPage({ locked: true })
    expect(screen.queryByRole('button', { name: /Take payment/ })).toBeNull()
    expect(screen.getByTestId('service-payment').tagName).toBe('SPAN')
  })

  it('reads as a label when it only reads: no outline, no hand cursor', () => {
    paymentStatus.value = 'paid'
    renderPage()
    const pill = screen.getByTestId('service-payment')
    expect(pill.className).toContain('border-transparent')
    expect(pill.className).toContain('cursor-default')
  })
})

describe('the status pill in the work order header', () => {
  it('is a label, not a control, whoever is looking and however the job stands', () => {
    for (const options of [{}, { locked: true }, { canTakePayment: false }]) {
      renderPage(options)
      const status = screen.getByTestId('service-status')
      expect(status.tagName).toBe('SPAN')
      expect(status.textContent).toBe('Pending')
      expect(status.className).toContain('border-transparent')
      expect(status.className).toContain('cursor-default')
      cleanup()
    }
  })

  it('leaves the type dropdown as the box in the row that opens something', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeTruthy()
  })
})

describe('who may take payments', () => {
  it('lets owners and admins through', async () => {
    expect(await canTakePayments({ userId: 'u1', isAdmin: true })).toBe(true)
  })

  it('needs CREATE on billing from a custom role', async () => {
    membership.value = {
      customRole: { isAdmin: false, permissions: [{ action: 'create', subject: 'billing' }] },
    }
    expect(await canTakePayments({ userId: 'u1', isAdmin: false })).toBe(true)
    membership.value = {
      customRole: { isAdmin: false, permissions: [{ action: 'read', subject: 'billing' }] },
    }
    expect(await canTakePayments({ userId: 'u1', isAdmin: false })).toBe(false)
  })

  it('gives a member with no role nothing, as the server does', async () => {
    membership.value = { customRole: null }
    expect(await canTakePayments({ userId: 'u1', isAdmin: false })).toBe(false)
    expect(await canTakePayments(null)).toBe(false)
  })
})
