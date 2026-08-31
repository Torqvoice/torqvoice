/**
 * A locked quote must not queue a save it cannot make.
 *
 * The quote page has the same five-second autosave as the invoice page, and
 * the same trap was open here after the invoice side closed it: a quote that
 * locks (sent or accepted, depending on the trigger) kept marking itself
 * dirty and firing autosaves the server refuses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('@/features/quotes/Actions/quoteActions', () => ({
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
  convertQuoteToServiceRecord: vi.fn(),
}))
vi.mock('@/features/quotes/Actions/quoteResponseActions', () => ({
  acknowledgeQuoteResponse: vi.fn(),
}))

import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'

const AUTOSAVE_DELAY = 5000

const quote = {
  id: 'quote-1',
  status: 'accepted',
  customer: null,
  vehicle: null,
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

function renderForm(locked: boolean) {
  return renderHook(
    (props: { locked: boolean }) =>
      useQuoteFormState({
        quote,
        currencyCode: 'USD',
        defaultTaxRate: 0,
        taxEnabled: true,
        defaultLaborRate: 0,
        locked: props.locked,
        t: (key: string) => key,
      }),
    { initialProps: { locked } }
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('an editable quote', () => {
  it('marks the form dirty on an edit', () => {
    const { result } = renderForm(false)

    act(() => result.current.markDirty())

    expect(result.current.hasUnsavedChanges).toBe(true)
  })
})

describe('a locked quote', () => {
  it('never reports unsaved changes', () => {
    const { result } = renderForm(true)

    act(() => result.current.markDirty())

    expect(result.current.hasUnsavedChanges).toBe(false)
  })
})

describe('the lock engaging mid-session', () => {
  it('clears the queued state once the page learns of the lock', () => {
    // Edit, then send the quote: the refresh flips the locked prop, and the
    // pending save and "Unsaved changes" must go with it.
    const { result, rerender } = renderForm(false)

    act(() => result.current.markDirty())
    expect(result.current.hasUnsavedChanges).toBe(true)

    rerender({ locked: true })

    expect(result.current.hasUnsavedChanges).toBe(false)

    act(() => void vi.advanceTimersByTime(AUTOSAVE_DELAY * 2))
    expect(result.current.hasUnsavedChanges).toBe(false)
  })
})
