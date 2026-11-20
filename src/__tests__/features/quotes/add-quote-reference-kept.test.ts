/**
 * Adding a quote to a work order that has its own, different Reference / PO.
 *
 * The work order keeps its own; the quote's is not lost without a word. The
 * page says so as it moves to the work order, naming both.
 */

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
const push = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('@/features/quotes/Actions/quoteActions', () => ({
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
  convertQuoteToServiceRecord: vi.fn(),
  addQuoteToServiceRecord: vi.fn(),
  getQuoteConversionConflicts: vi.fn(async () => ({ success: true, data: [] })),
  getWorkOrdersForQuoteConversion: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('@/features/quotes/Actions/quoteResponseActions', () => ({
  acknowledgeQuoteResponse: vi.fn(),
}))

import { addQuoteToServiceRecord } from '@/features/quotes/Actions/quoteActions'
import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'

const quote = {
  id: 'quote-1',
  status: 'accepted',
  customer: null,
  vehicle: { id: 'veh-1' },
  partItems: [],
  laborItems: [],
  taxRate: 0,
  taxInclusive: false,
  discountType: 'none',
  discountValue: 0,
  description: '',
  notes: '',
  validUntil: null,
} as any

const t = (key: string, values?: Record<string, string>) =>
  key === 'page.convertReferenceKept'
    ? `The work order kept its own Reference / PO, ${values?.job}. The quote's, ${values?.quote}, was not copied to it.`
    : key

async function addToJob(referenceKept: { job: string; quote: string } | null) {
  vi.mocked(addQuoteToServiceRecord).mockResolvedValue({
    success: true,
    data: { id: 'sr-1', vehicleId: 'veh-1', referenceKept },
  } as any)
  const { result } = renderHook(() =>
    useQuoteFormState({
      quote,
      currencyCode: 'GBP',
      defaultTaxRate: 0,
      taxEnabled: true,
      defaultLaborRate: 0,
      locked: false,
      t,
    } as any)
  )
  act(() => {
    result.current.setConvertMode('existing')
    result.current.setConvertTargetId('sr-1')
  })
  await act(async () => {
    await result.current.handleConvert()
  })
}

beforeEach(() => vi.clearAllMocks())

describe('adding a quote to a work order with its own Reference / PO', () => {
  it('says the work order kept its own, naming both, and opens the work order', async () => {
    await addToJob({ job: 'PO-ON-THE-JOB', quote: 'PO-48213' })

    expect(toast.info).toHaveBeenCalledWith(
      "The work order kept its own Reference / PO, PO-ON-THE-JOB. The quote's, PO-48213, was not copied to it.",
      expect.anything()
    )
    expect(push).toHaveBeenCalledWith('/vehicles/veh-1/service/sr-1')
  })

  it('says nothing when nothing was left behind', async () => {
    await addToJob(null)

    expect(toast.info).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/vehicles/veh-1/service/sr-1')
  })
})
