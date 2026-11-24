/**
 * Follow-ups to the quote line limits.
 *
 * - A save refused for a line past the limits stopped nothing: Convert went
 *   on with what the database held before the edit (and the edit was lost),
 *   and the PDF and sending went on too. A refused save now stops them, with
 *   the refusal said; an unchanged quote, even one saved before the limits,
 *   still converts.
 * - The quote's taxed share was summed from unrounded lines while the
 *   subtotal was summed from rounded ones (3 x 2.5 h at 19.99: 149.94
 *   against 149.93), so 25% came to 37.48 instead of 37.49.
 * - The work order's over-limit reading took the cursor on every autosave.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/quotes/quote-1',
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: (m: string) => toastError(m) },
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/confirm-dialog')>()),
  useConfirm: () => vi.fn(async () => true),
}))
const updateQuote = vi.fn()
const convertQuoteToServiceRecord = vi.fn()
vi.mock('@/features/quotes/Actions/quoteActions', () => ({
  updateQuote: (input: unknown) => updateQuote(input),
  deleteQuote: vi.fn(),
  convertQuoteToServiceRecord: (...args: unknown[]) => convertQuoteToServiceRecord(...args),
  addQuoteToServiceRecord: vi.fn(),
  getQuoteConversionConflicts: vi.fn(async () => ({ success: true, data: [] })),
  getWorkOrdersForQuoteConversion: vi.fn(async () => ({ success: true, data: [] })),
  updateQuoteStatus: vi.fn(),
}))
vi.mock('@/features/quotes/Actions/quoteResponseActions', () => ({
  acknowledgeQuoteResponse: vi.fn(),
}))
const updateServiceRecord = vi.fn()
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  updateServiceRecord: (input: unknown) => updateServiceRecord(input),
  deleteServiceRecord: vi.fn(),
  deleteServiceAttachment: vi.fn(),
  toggleManuallyPaid: vi.fn(),
}))
vi.mock('@/features/payments/Actions/paymentActions', () => ({
  createPayment: vi.fn(),
  deletePayment: vi.fn(),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({ getSmsTemplates: vi.fn() }))

import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'
import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'

const part = (over: Record<string, unknown> = {}) => ({
  partNumber: '',
  name: 'ZZ Brake pads',
  quantity: 1,
  unitCost: 0,
  markupPercent: 0,
  unitPrice: 100,
  total: 100,
  excluded: false,
  ...over,
})

const quote = (over: Record<string, unknown> = {}) =>
  ({
    id: 'quote-1',
    status: 'draft',
    customer: null,
    vehicle: { id: 'v-1' },
    partItems: [part()],
    laborItems: [],
    taxRate: 0,
    taxInclusive: false,
    discountType: 'none',
    discountValue: 0,
    description: '',
    notes: '',
    validUntil: null,
    ...over,
  }) as any

/** The quote hook, with the form it submits through. */
function quotePage(record: ReturnType<typeof quote>, taxRate = 0) {
  const hook = renderHook(() =>
    useQuoteFormState({
      quote: record,
      currencyCode: 'GBP',
      defaultTaxRate: taxRate,
      taxEnabled: true,
      defaultLaborRate: 0,
      t: (key: string) => key,
    })
  )
  const form = document.createElement('form')
  form.innerHTML = '<input name="title" value="ZZ Brakes" />'
  form.requestSubmit = () => {
    void hook.result.current.handleSubmit({
      preventDefault: () => undefined,
      currentTarget: form,
    } as unknown as React.FormEvent<HTMLFormElement>)
  }
  document.body.appendChild(form)
  ;(hook.result.current.formRef as { current: HTMLFormElement | null }).current = form
  return hook
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

beforeEach(() => {
  toastError.mockClear()
  updateQuote.mockReset().mockResolvedValue({ success: true, data: {} })
  convertQuoteToServiceRecord
    .mockReset()
    .mockResolvedValue({ success: true, data: { id: 'job-9' } })
  updateServiceRecord.mockReset().mockResolvedValue({ success: true })
})

describe('a quote whose save is refused', () => {
  it('is not converted, and says why', async () => {
    const hook = quotePage(quote())
    // A priced part typed down to a quantity of zero: the save refuses it.
    act(() => hook.result.current.updatePart(0, 'quantity', 0))
    await act(async () => {
      await hook.result.current.handleConvert()
    })
    expect(updateQuote).not.toHaveBeenCalled()
    expect(convertQuoteToServiceRecord).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('A priced part needs a quantity above zero.')
  })

  it('says so to whatever waits on the save', async () => {
    const hook = quotePage(quote())
    act(() => hook.result.current.updatePart(0, 'quantity', 1_000_000_000))
    let saved = true
    await act(async () => {
      saved = await hook.result.current.saveNow()
    })
    expect(saved).toBe(false)
  })

  it('still converts once the edit saves', async () => {
    const hook = quotePage(quote())
    act(() => hook.result.current.updatePart(0, 'quantity', 2))
    await act(async () => {
      await hook.result.current.handleConvert()
    })
    expect(updateQuote).toHaveBeenCalledTimes(1)
    expect(convertQuoteToServiceRecord).toHaveBeenCalledWith('quote-1', 'v-1')
  })
})

describe('a quote saved before the limits, left as it is', () => {
  it('converts without a save', async () => {
    const hook = quotePage(
      quote({
        partItems: [part({ quantity: 1_000_000_000, unitPrice: 99_999_999, total: 9.9999999e16 })],
      })
    )
    await act(async () => {
      await hook.result.current.handleConvert()
    })
    expect(updateQuote).not.toHaveBeenCalled()
    expect(convertQuoteToServiceRecord).toHaveBeenCalledWith('quote-1', 'v-1')
  })
})

describe("a quote's tax", () => {
  it('is charged on the lines as they are stored, each to the cent', () => {
    // Three lines of 2.5 h at 19.99, each 49.975 before rounding.
    const labor = {
      description: 'Fit',
      hours: 2.5,
      rate: 19.99,
      total: 49.974999999999994,
      pricingType: 'hourly',
      excluded: false,
    }
    const hook = quotePage(quote({ partItems: [], laborItems: [labor, labor, labor], taxRate: 25 }))
    expect(hook.result.current.subtotal).toBe(149.94)
    expect(hook.result.current.taxAmount).toBe(37.49)
    // Every line taxed: nothing left out to show.
    expect(hook.result.current.taxableShare).toBeNull()
  })
})

describe("the work order's reading past the limit", () => {
  function workOrder() {
    const form = {
      selectedVehicleId: 'v1',
      type: 'repair',
      status: 'in-progress',
      concerns: [],
      partItems: [],
      laborItems: [],
      partItemsForSave: [],
      laborItemsForSave: [],
      commitLaborAddedElsewhere: vi.fn(),
      commitPartsAddedElsewhere: vi.fn(),
      subtotal: 0,
      taxRate: 0,
      taxInclusive: false,
      taxAmount: 0,
      totalAmount: 0,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      warranty: {},
      isSavingRef: { current: false },
      autosaveTimer: { current: null },
      autosaveRunRef: { current: false },
      leavingRef: { current: false },
      lastSaveErrorRef: { current: null as string | null },
      editRevisionRef: { current: 1 },
      customFieldsSaveRef: { current: null },
      setLoading: vi.fn(),
      setHasUnsavedChanges: vi.fn(),
      flashSaved: vi.fn(),
      markSaved: vi.fn(),
      markDirty: vi.fn(),
      notesRef: { current: { description: '', diagnosticNotes: '', invoiceNotes: '' } },
      initialData: { id: 'job1', mileage: null, lastReading: null },
      confirmedReadingRef: { current: null },
      acknowledgeSavedLines: vi.fn(),
      sendingLinesRef: { current: null },
    }
    type Options = Parameters<typeof useServiceActions>[0]
    const hook = renderHook(() =>
      useServiceActions({
        record: { id: 'job1' } as unknown as Options['record'],
        vehicleId: 'v1',
        currencyCode: 'GBP',
        formState: form as unknown as Options['formState'],
      })
    )
    const el = document.createElement('form')
    el.innerHTML = `
      <input name="title" value="ZZ Brakes" />
      <input name="mileage" value="20000000" />
      <textarea aria-label="Notes"></textarea>`
    document.body.appendChild(el)
    const save = (autosave: boolean) => {
      form.autosaveRunRef.current = autosave
      return act(() =>
        hook.result.current.handleSubmit({
          preventDefault: () => undefined,
          currentTarget: el,
        } as unknown as React.FormEvent<HTMLFormElement>)
      )
    }
    return { el, save }
  }

  it('leaves the cursor where it is on an autosave', async () => {
    const { el, save } = workOrder()
    const notes = el.querySelector('textarea') as HTMLTextAreaElement
    notes.focus()
    await save(true)
    expect(updateServiceRecord).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(notes)
  })

  it('takes the cursor to the reading on a save that was asked for', async () => {
    const { el, save } = workOrder()
    await save(false)
    expect(document.activeElement).toBe(el.querySelector('input[name="mileage"]'))
  })
})
