/**
 * The title, edited in the work order's header, when the job is renamed in
 * another tab.
 *
 * The header saves a rename on its own the moment the field is left. A rename
 * the server refuses stays on the page, unsaved, for the form's save to try
 * again. The page used to put the record's title back over the header and the
 * form's hidden copy whenever it was read again, so a rename in another tab
 * quietly threw away the one waiting here. The header now follows a title
 * saved elsewhere only when this page has none of its own waiting.
 *
 * The page, its form state and its save are the real ones; the details below
 * the header are cut down to the form and its hidden title, wired as
 * ModernDetails wires them.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({ getCachedMembership: async () => null }))
vi.mock('@/features/inspections/Components/NewInspectionDialog', () => ({
  NewInspectionDialog: () => null,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/vehicles/v1/service/job1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/vehicles/Actions/findingActions', () => ({ deleteFinding: vi.fn() }))
const updateServiceRecordTitle = vi.fn()
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  updateServiceRecordTitle: (id: string, title: string) => updateServiceRecordTitle(id, title),
  updateServiceStatus: vi.fn(),
  updateServiceRecord: vi.fn(),
  deleteServiceRecord: vi.fn(),
  deleteServiceAttachment: vi.fn(),
  toggleManuallyPaid: vi.fn(),
}))
const saveServiceRecordChanges = vi.fn()
vi.mock('@/features/vehicles/Actions/saveServiceRecordChanges', () => ({
  saveServiceRecordChanges: (input: unknown) => saveServiceRecordChanges(input),
}))
vi.mock('@/features/payments/Actions/paymentActions', () => ({
  createPayment: vi.fn(),
  deletePayment: vi.fn(),
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
vi.mock('@/hooks/use-deferred-commit', () => ({
  useDeferredCommit: () => ({ schedule: vi.fn(), cancel: vi.fn() }),
}))
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
vi.mock('@/features/vehicles/Components/service-page/LeaveUnsavedDialog', () => ({
  LeaveUnsavedDialog: () => null,
}))
vi.mock('@/features/realtime/Components/PresenceChips', () => ({ PresenceChips: () => null }))
vi.mock('@/features/vehicles/Components/service-page/ObservationsManager', () => ({
  ObservationsManager: () => null,
}))

/** The form and its hidden title, as ModernDetails draws them. */
vi.mock('@/features/vehicles/Components/service-page/modern/ModernDetails', () => ({
  ModernDetails: ({
    form,
    title,
  }: {
    form: React.FormHTMLAttributes<HTMLFormElement> & { ref: React.Ref<HTMLFormElement> }
    title: string
  }) => (
    <form {...form} data-testid="service-form" noValidate>
      <input type="hidden" name="title" value={title} />
    </form>
  ),
}))

import { ServicePageClient } from '@/features/vehicles/Components/service-page/ServicePageClient'

/** The page's props, read with the job titled `title`. */
function props(title: string) {
  return {
    record: {
      id: 'job1',
      title,
      invoiceNumber: 'WO-1001',
      customer: null,
      vehicle: { id: 'v1', year: 2019, make: 'Volvo', model: 'V70', customer: null },
      publicToken: null,
      payments: [],
      attachments: [],
      manuallyPaid: false,
      cost: 0,
    },
    vehicleId: 'v1',
    organizationId: 'org1',
    lockState: { locked: false, unlockedAt: null },
    canUnlock: false,
    canTakePayment: false,
    currencyCode: 'GBP',
    unitSystem: 'metric',
    defaultTaxRate: 20,
    initialData: {
      id: 'job1',
      title,
      type: 'repair',
      status: 'in-progress',
      mileage: null,
      invoiceDate: '',
      invoiceDueDate: '',
      concerns: [],
      partItems: [],
      laborItems: [],
      taxRate: 20,
      taxInclusive: false,
      discountValue: 0,
    },
    openObservations: [],
  } as unknown as Parameters<typeof ServicePageClient>[0]
}

const hiddenTitle = () =>
  (screen.getByTestId('service-form').querySelector('input[name="title"]') as HTMLInputElement)
    .value
const headerTitle = () => screen.getAllByTestId('service-title')[0].textContent

async function renameInHeader(next: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId('edit-title'))
  })
  const field = screen.getByTestId('title-input')
  fireEvent.change(field, { target: { value: next } })
  await act(async () => {
    fireEvent.keyDown(field, { key: 'Enter' })
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  updateServiceRecordTitle.mockReset()
  saveServiceRecordChanges.mockReset().mockResolvedValue({ success: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the header title when the job is renamed in another tab', () => {
  it('keeps a rename the server refused, says so, and saves it with the form', async () => {
    updateServiceRecordTitle.mockResolvedValue({ success: false, error: 'Try again.' })
    const page = render(<ServicePageClient {...props('ZZ Annual service')} />)

    await renameInHeader('ZZ Annual service and brakes')
    expect(updateServiceRecordTitle).toHaveBeenCalledWith('job1', 'ZZ Annual service and brakes')

    // Another tab renames the job; this page reads it again.
    page.rerender(<ServicePageClient {...props('ZZ Renamed in the other tab')} />)

    expect(headerTitle()).toContain('ZZ Annual service and brakes')
    expect(hiddenTitle()).toBe('ZZ Annual service and brakes')
    expect(screen.getByTestId('changed-elsewhere-banner')).toHaveTextContent(
      'Changed elsewhere while you were editing: Title.'
    )

    // The form's save tries the rename again, and it is the later one.
    await act(async () => {
      fireEvent.submit(screen.getByTestId('service-form'))
    })
    expect(saveServiceRecordChanges).toHaveBeenCalledWith({
      id: 'job1',
      title: 'ZZ Annual service and brakes',
    })
  })

  it('follows a rename made elsewhere when this page has none waiting', async () => {
    const page = render(<ServicePageClient {...props('ZZ Annual service')} />)
    page.rerender(<ServicePageClient {...props('ZZ Renamed in the other tab')} />)

    expect(headerTitle()).toContain('ZZ Renamed in the other tab')
    expect(hiddenTitle()).toBe('ZZ Renamed in the other tab')
    expect(screen.queryByTestId('changed-elsewhere-banner')).toBeNull()
  })

  it('takes a later rename elsewhere over one it saved, and says so', async () => {
    updateServiceRecordTitle.mockResolvedValue({ success: true })
    const page = render(<ServicePageClient {...props('ZZ Annual service')} />)

    await renameInHeader('ZZ Annual service and brakes')
    page.rerender(<ServicePageClient {...props('ZZ Annual service and brakes')} />)
    page.rerender(<ServicePageClient {...props('ZZ Renamed in the other tab')} />)

    expect(headerTitle()).toContain('ZZ Renamed in the other tab')
    expect(hiddenTitle()).toBe('ZZ Renamed in the other tab')
    expect(screen.getByTestId('changed-elsewhere-banner')).toHaveTextContent(
      'Changed elsewhere: Title.'
    )
  })
})
