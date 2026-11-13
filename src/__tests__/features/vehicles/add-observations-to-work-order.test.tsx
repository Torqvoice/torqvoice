/**
 * "Add to Work Order" on a work order: open observations from earlier visits
 * become lines on this job and leave the vehicle's list. The lines used to be
 * added first and the deletes never read, so an observation the server kept,
 * or one whose delete never arrived, was both a line here and still open on
 * the vehicle, under a toast that said all of them were added.
 *
 * The page is large; everything around the observations is stood in for, and
 * the job's lines are drawn from the form state the page hands its details.
 */
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/features/email/Components/SendEmailDialog', () => ({ SendEmailDialog: () => null }))
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
vi.mock('@/features/vehicles/Components/service-page/modern/ModernHero', () => ({
  ModernHero: () => null,
}))

type Line = { description: string }

/** The job's lines, as the details would list them. */
vi.mock('@/features/vehicles/Components/service-page/modern/ModernDetails', () => ({
  ModernDetails: ({ formState }: { formState: { laborItems: Line[] } }) => (
    <ul aria-label="Labor">
      {formState.laborItems.map((line) => (
        <li key={line.description}>{line.description}</li>
      ))}
    </ul>
  ),
}))

/** The vehicle's open observations, all ticked, and the button that adds them. */
vi.mock('@/features/vehicles/Components/service-page/ObservationsManager', () => ({
  ObservationsManager: ({
    openObservations,
    onAddObservations,
    addingObservations,
  }: {
    openObservations: { id: string }[]
    onAddObservations: (ids: string[]) => Promise<void>
    addingObservations: boolean
  }) => (
    <button
      type="button"
      disabled={addingObservations}
      onClick={() => onAddObservations(openObservations.map((o) => o.id))}
    >
      Add to Work Order ({openObservations.length})
    </button>
  ),
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
      warranty: null,
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

const observation = (id: string, description: string) => ({
  id,
  description,
  severity: 'needs_work',
  notes: null,
  serviceRecordId: 'earlier-job',
})

function renderPage() {
  const props = {
    record: {
      id: 'job1',
      title: 'Annual service',
      customer: null,
      vehicle: { year: 2019, make: 'Volvo', model: 'V70', customer: null },
      publicToken: null,
    },
    vehicleId: 'v1',
    organizationId: 'org1',
    lockState: { locked: false, unlockedAt: null },
    canUnlock: false,
    currencyCode: 'NOK',
    unitSystem: 'metric',
    initialData: { invoiceDate: null, invoiceDueDate: null },
    openObservations: [
      observation('o1', 'Front pads worn'),
      observation('o2', 'Wiper blades torn'),
    ],
  }
  // Only what this part of the page reads is given.
  render(<ServicePageClient {...(props as unknown as Parameters<typeof ServicePageClient>[0])} />)
}

const addAll = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add to Work Order (2)' }))
  })

const lines = () =>
  Array.from(screen.getByRole('list', { name: 'Labor' }).querySelectorAll('li')).map(
    (li) => li.textContent
  )

describe('adding open observations to a work order', () => {
  beforeEach(() => {
    deleteFinding.mockReset()
    router.refresh.mockClear()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('adds every observation the vehicle let go of', async () => {
    deleteFinding.mockImplementation(async (id: string) => ({
      success: true,
      data: { findingId: id },
    }))
    renderPage()

    await addAll()

    expect(lines()).toEqual(['Front pads worn', 'Wiper blades torn'])
    expect(toast.success).toHaveBeenCalledWith('2 observations added to work order')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('adds only the one the server let go of, and says the other was not added', async () => {
    deleteFinding.mockImplementation(async (id: string) => {
      if (id === 'o1') return { success: true, data: { findingId: id } }
      throw new TypeError('Failed to fetch')
    })
    renderPage()

    await addAll()

    expect(lines()).toEqual(['Front pads worn'])
    expect(toast.success).toHaveBeenCalledWith('1 observations added to work order')
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't add 1 observation to the work order. Try again.",
      undefined
    )
  })

  it('adds nothing and says why when the server refuses them all', async () => {
    deleteFinding.mockResolvedValue({ success: false, error: 'Insufficient permissions' })
    renderPage()

    await addAll()

    expect(lines()).toEqual([])
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't add 2 observations to the work order. Try again.",
      { description: 'Insufficient permissions' }
    )
    expect(screen.getByRole('button', { name: 'Add to Work Order (2)' })).toBeEnabled()
  })
})
