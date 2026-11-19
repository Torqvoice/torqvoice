/**
 * Pressing Save on a locked quote says the quote is locked.
 *
 * Save stays on the locked page, as it does on a locked work order, and the
 * server's refusal is shown in the page's error dialog. The locked page turns
 * its inputs off, so the form it submits carries no title: the save must go
 * out all the same and come back with the lock's own sentence, never with a
 * field name and a parser's complaint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const modalOpen = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: modalOpen }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('@/features/quotes/Actions/quoteActions', () => ({
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
  convertQuoteToServiceRecord: vi.fn(),
}))
vi.mock('@/features/quotes/Actions/quoteResponseActions', () => ({
  acknowledgeQuoteResponse: vi.fn(),
}))

import { updateQuote } from '@/features/quotes/Actions/quoteActions'
import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'

const LOCK_SENTENCE = 'This document is locked because it has been sent.'

const quote = {
  id: 'quote-1',
  status: 'sent',
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

/** The quote form as the locked page renders it: every input turned off. */
function lockedForm() {
  const form = document.createElement('form')
  form.innerHTML =
    '<fieldset disabled><input name="title" value="ZZ Rear shock absorbers" />' +
    '<input name="validUntil" value="" /></fieldset>'
  return form
}

beforeEach(() => vi.clearAllMocks())

describe('Save on a locked quote', () => {
  it('shows the lock sentence in the error dialog', async () => {
    vi.mocked(updateQuote).mockResolvedValue({ success: false, error: LOCK_SENTENCE } as any)
    const { result } = renderHook(() =>
      useQuoteFormState({
        quote,
        currencyCode: 'GBP',
        defaultTaxRate: 0,
        taxEnabled: true,
        defaultLaborRate: 0,
        locked: true,
        t: (key: string) => key,
      })
    )

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
        currentTarget: lockedForm(),
      } as any)
    })

    // The form with its inputs off has no title to send.
    expect(vi.mocked(updateQuote).mock.calls[0][0]).toMatchObject({ id: 'quote-1', title: null })
    expect(modalOpen).toHaveBeenCalledTimes(1)
    expect(modalOpen).toHaveBeenCalledWith('error', 'Error', LOCK_SENTENCE)
    expect(result.current.saving).toBe(false)
  })
})
