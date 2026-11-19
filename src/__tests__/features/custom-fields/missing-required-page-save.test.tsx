/**
 * What the page does when its save is stopped by a required custom field.
 *
 * The custom fields are saved first, as part of the page's own save: the Save
 * button, the autosave five seconds after an edit, and the save a link waits
 * for all go through it. When a required field is empty, nothing of the work
 * order or quote is saved, and the person is told so with the fields named:
 * in a toast for a save or an autosave, in the leave dialog when a link was
 * waiting. Nothing is dropped quietly: the page stays marked unsaved.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/quotes/quote-1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }))
vi.mock('@/components/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/confirm-dialog')>()),
  useConfirm: () => vi.fn(async () => true),
}))
const updateQuote = vi.fn()
vi.mock('@/features/quotes/Actions/quoteActions', () => ({
  updateQuote: (input: unknown) => updateQuote(input),
  deleteQuote: vi.fn(),
  convertQuoteToServiceRecord: vi.fn(),
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

import type { CustomFieldsSave } from '@/features/custom-fields/Components/CustomFieldsForm'
import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'
import { LeaveUnsavedDialog } from '@/features/vehicles/Components/service-page/LeaveUnsavedDialog'
import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'
import quotesEn from '../../../../messages/en/quotes.json'
import serviceEn from '../../../../messages/en/service.json'

const ONE = { valid: false as const, problem: 'required' as const, fields: ['Fleet contact'] }
const TWO = {
  valid: false as const,
  problem: 'required' as const,
  fields: ['Fleet contact', 'Cost centre'],
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  document.body.innerHTML = ''
})

beforeEach(() => {
  toastError.mockClear()
  updateQuote.mockReset().mockResolvedValue({ success: true })
  updateServiceRecord.mockReset().mockResolvedValue({ success: true })
})

describe('the words', () => {
  it('say nothing was saved and leave room for the field names', () => {
    for (const page of [serviceEn.page, quotesEn.page]) {
      expect(page.customFieldsMissing).toBe('Not saved. Fill in: {fields}')
      expect(page.customFieldsNotValid).toBe('Not saved. Check: {fields}')
    }
  })
})

describe('a work order', () => {
  type Options = Parameters<typeof useServiceActions>[0]

  function page(customFieldsSave: CustomFieldsSave) {
    // What a save reads before it gets to the work order itself.
    const form = {
      isSavingRef: { current: false },
      autosaveTimer: { current: null },
      autosaveRunRef: { current: false },
      leavingRef: { current: false },
      lastSaveErrorRef: { current: null as string | null },
      editRevisionRef: { current: 0 },
      customFieldsSaveRef: { current: customFieldsSave },
      setHasUnsavedChanges: vi.fn(),
    }
    const hook = renderHook(() =>
      useServiceActions({
        record: { id: 'job1' } as unknown as Options['record'],
        vehicleId: 'v1',
        currencyCode: 'GBP',
        formState: form as unknown as Options['formState'],
      })
    )
    const save = () =>
      act(() =>
        hook.result.current.handleSubmit({
          preventDefault: () => undefined,
          currentTarget: document.createElement('form'),
        } as unknown as React.FormEvent<HTMLFormElement>)
      )
    return { form, save }
  }

  it('one required field empty: the toast names it, and nothing of the work order is saved', async () => {
    const customFields = vi.fn(async () => ONE)
    const { form, save } = page(customFields)

    await save()

    expect(toastError).toHaveBeenCalledWith('Not saved. Fill in: Fleet contact')
    expect(updateServiceRecord).not.toHaveBeenCalled()
    // Saving is free again, and the page was not marked saved.
    expect(form.isSavingRef.current).toBe(false)
    expect(form.setHasUnsavedChanges).not.toHaveBeenCalled()
    // The person asked for this save, so they are taken to the field.
    expect(customFields).toHaveBeenCalledWith({ reveal: true })
  })

  it('two required fields empty: the toast names both', async () => {
    const { save } = page(vi.fn(async () => TWO))

    await save()

    expect(toastError).toHaveBeenCalledWith('Not saved. Fill in: Fleet contact, Cost centre')
    expect(updateServiceRecord).not.toHaveBeenCalled()
  })

  it('a value that does not fit is named too, in its own words', async () => {
    const { save } = page(
      vi.fn(async () => ({ valid: false as const, problem: 'invalid' as const, fields: ['Axles'] }))
    )

    await save()

    expect(toastError).toHaveBeenCalledWith('Not saved. Check: Axles')
  })

  it('an autosave says the same, without taking the person away from what they are typing', async () => {
    const customFields = vi.fn(async () => TWO)
    const { form, save } = page(customFields)
    form.autosaveRunRef.current = true

    await save()

    expect(customFields).toHaveBeenCalledWith({ reveal: false })
    expect(toastError).toHaveBeenCalledWith('Not saved. Fill in: Fleet contact, Cost centre')
    // Spent: the next save, one they ask for, takes them to the field.
    expect(form.autosaveRunRef.current).toBe(false)
  })

  it('a link waiting on the save gets the names for its dialog, not a toast on top of it', async () => {
    const { form, save } = page(vi.fn(async () => TWO))
    form.leavingRef.current = true

    await save()

    expect(form.lastSaveErrorRef.current).toBe('Not saved. Fill in: Fleet contact, Cost centre')
    expect(toastError).not.toHaveBeenCalled()
    expect(updateServiceRecord).not.toHaveBeenCalled()
  })
})

describe('a quote', () => {
  const quote = {
    id: 'quote-1',
    status: 'draft',
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
  } as never

  /** The quote page as far as saving goes, with the real English for its messages. */
  function QuotePage({ customFieldsSave }: { customFieldsSave: CustomFieldsSave }) {
    const state = useQuoteFormState({
      quote,
      currencyCode: 'GBP',
      defaultTaxRate: 0,
      taxEnabled: true,
      defaultLaborRate: 0,
      locked: false,
      t: ((key: string, values?: Record<string, string>) => {
        const text =
          (quotesEn.page as unknown as Record<string, string>)[key.replace('page.', '')] ?? key
        return text.replace('{fields}', values?.fields ?? '')
      }) as never,
    })
    state.onCustomFieldsReady(customFieldsSave)
    return (
      <>
        <a href="/customers">Customers</a>
        <form ref={state.formRef} onSubmit={state.handleSubmit} aria-label="Quote">
          <input name="title" aria-label="Title" defaultValue="Brakes" onChange={state.markDirty} />
          <button type="submit">Save</button>
        </form>
        <LeaveUnsavedDialog
          open={state.blockedLeave !== null}
          reason={state.blockedLeave?.reason ?? null}
          onStay={state.stayOnPage}
          onLeave={state.leaveWithoutSaving}
        />
      </>
    )
  }

  const pressSave = () =>
    act(async () => fireEvent.submit(screen.getByRole('form', { name: 'Quote' })))

  it('one required field empty: the toast names it, and nothing of the quote is saved', async () => {
    const customFields = vi.fn(async () => ONE)
    render(<QuotePage customFieldsSave={customFields} />)

    await pressSave()

    expect(toastError).toHaveBeenCalledWith('Not saved. Fill in: Fleet contact')
    expect(updateQuote).not.toHaveBeenCalled()
    expect(customFields).toHaveBeenCalledWith({ reveal: true })
  })

  it('two required fields empty: the toast names both', async () => {
    render(<QuotePage customFieldsSave={vi.fn(async () => TWO)} />)

    await pressSave()

    expect(toastError).toHaveBeenCalledWith('Not saved. Fill in: Fleet contact, Cost centre')
    expect(updateQuote).not.toHaveBeenCalled()
  })

  it('all filled in: the quote is saved and nothing is said', async () => {
    render(<QuotePage customFieldsSave={vi.fn(async () => ({ valid: true as const }))} />)

    await pressSave()

    expect(updateQuote).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('the autosave says it too, and leaves the focus where the person is typing', async () => {
    vi.useFakeTimers()
    const customFields = vi.fn(async () => TWO)
    render(<QuotePage customFieldsSave={customFields} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brakes, rear' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })

    expect(customFields).toHaveBeenCalledWith({ reveal: false })
    expect(toastError).toHaveBeenCalledWith('Not saved. Fill in: Fleet contact, Cost centre')
    expect(updateQuote).not.toHaveBeenCalled()
  })

  it('leaving by a link is held, and the dialog names the fields', async () => {
    vi.useFakeTimers()
    render(<QuotePage customFieldsSave={vi.fn(async () => TWO)} />)
    const link = screen.getByRole('link', { name: 'Customers' })
    const followed = vi.fn((event: Event) => event.preventDefault())
    link.addEventListener('click', followed)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brakes, rear' } })
    fireEvent.click(link)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(followed).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Not saved. Fill in: Fleet contact, Cost centre'
    )
    expect(toastError).not.toHaveBeenCalled()
    expect(updateQuote).not.toHaveBeenCalled()
  })
})
