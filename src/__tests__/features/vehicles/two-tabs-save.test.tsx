/**
 * The same work order open in two tabs.
 *
 * The page used to save its whole form. Tab B added a line to the internal
 * notes and saved; tab A, opened earlier, then changed the mileage and saved
 * its whole form, notes included, as it had read them: B's note was gone.
 *
 * Now each save sends only the fields that tab changed. A field saved in both
 * goes to the later save, and the tab whose value lost is told. A tab with
 * edits of its own takes, from the job as the server has it, every field it
 * has not touched.
 *
 * Both tabs are the real form state and the real save, as ServicePageClient
 * wires them, against one stored job; only the server action is a stand-in
 * that writes what it is sent, field by field, as the real one does.
 */
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/vehicles/veh-1/service/rec-1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/use-deferred-commit', () => ({
  useDeferredCommit: () => ({ schedule: vi.fn(), cancel: vi.fn() }),
}))
vi.mock('@/components/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/confirm-dialog')>()),
  useConfirm: () => vi.fn(async () => true),
}))
const saveServiceRecordChanges = vi.fn()
vi.mock('@/features/vehicles/Actions/saveServiceRecordChanges', () => ({
  saveServiceRecordChanges: (input: unknown) => saveServiceRecordChanges(input),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  deleteServiceRecord: vi.fn(),
  deleteServiceAttachment: vi.fn(),
  toggleManuallyPaid: vi.fn(),
}))
vi.mock('@/features/payments/Actions/paymentActions', () => ({
  createPayment: vi.fn(),
  deletePayment: vi.fn(),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({ getSmsTemplates: vi.fn() }))

import { ChangedElsewhereBanner } from '@/features/vehicles/Components/service-page/ChangedElsewhereBanner'
import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'

const DIAGNOSIS: ServiceLaborInput = {
  description: 'ZZ Diagnosis',
  hours: 1,
  rate: 100,
  total: 100,
  pricingType: 'hourly',
}

/** The job as the server stores it. */
let stored: Record<string, unknown>

function freshJob() {
  return {
    id: 'rec-1',
    title: 'ZZ Brake inspection',
    type: 'repair',
    status: 'in-progress',
    mileage: 88000,
    description: '',
    diagnosticNotes: '<p>Pads worn</p>',
    invoiceNotes: '',
    invoiceNumber: 'ZZ-1001',
    invoiceDate: '',
    invoiceDueDate: '',
    concerns: [],
    partItems: [],
    laborItems: [DIAGNOSIS],
    taxRate: 25,
    taxInclusive: false,
    discountType: 'none',
    discountValue: 0,
    warrantyStatus: null,
    warrantyMonths: null,
    warrantyMileage: null,
    warrantyNotes: null,
  }
}

/** What a tab's next read of the job brings: the stored job, copied. */
function props() {
  return {
    vehicleId: 'veh-1',
    defaultTaxRate: 25,
    currentUserName: 'Desk',
    record: { id: 'rec-1', attachments: [], payments: [] } as never,
    initialData: structuredClone(stored) as never,
  }
}

/** One browser tab on the work order: its form state, its save and its form. */
function openTab() {
  const hook = renderHook(
    (p: ReturnType<typeof props>) => {
      const formState = useServiceFormState(p)
      const actions = useServiceActions({
        record: p.record,
        vehicleId: 'veh-1',
        currencyCode: 'GBP',
        formState,
      })
      return { formState, actions }
    },
    { initialProps: props() }
  )
  const form = document.createElement('form')
  form.innerHTML = `
    <input type="hidden" name="title" value="${stored.title}" />
    <input name="mileage" value="${stored.mileage ?? ''}" />
    <input name="invoiceNumber" value="${stored.invoiceNumber}" />`
  document.body.appendChild(form)
  hook.result.current.formState.formRef.current = form
  const page = () => hook.result.current.formState
  const input = (name: string) =>
    form.querySelector<HTMLInputElement>(`input[name="${name}"]`) as HTMLInputElement
  return {
    page,
    input,
    /** A field typed into, the way the form's onInput marks the page unsaved. */
    type: (name: string, value: string) =>
      act(() => {
        input(name).value = value
        page().markDirty()
      }),
    writeNote: (field: 'diagnosticNotes' | 'invoiceNotes', html: string) =>
      act(() => page().handleNotesChange(field, html)),
    save: () =>
      act(() =>
        hook.result.current.actions.handleSubmit({
          preventDefault: () => undefined,
          currentTarget: form,
        } as unknown as React.FormEvent<HTMLFormElement>)
      ),
    /** The job changed somewhere else; the page reads it again (useLiveRecord). */
    refresh: () => hook.rerender(props()),
  }
}

const sent = (call = -1) =>
  saveServiceRecordChanges.mock.calls.at(call)?.[0] as Record<string, unknown>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  stored = freshJob()
  // The server writes each field it is sent and leaves the rest as stored.
  saveServiceRecordChanges
    .mockReset()
    .mockImplementation(async (input: Record<string, unknown>) => {
      const { id: _id, ...fields } = input
      stored = { ...stored, ...structuredClone(fields) }
      return { success: true, data: { id: 'rec-1' } }
    })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('the same work order in two tabs', () => {
  it('keeps a note saved in one tab when the other, opened earlier, saves the mileage', async () => {
    const a = openTab()
    const b = openTab()

    b.writeNote('diagnosticNotes', '<p>Pads worn</p><p>Customer hears a rattle</p>')
    await b.save()
    // Tab A never heard about it: it saves the mileage from its old copy.
    a.type('mileage', '88450')
    await a.save()

    expect(sent()).toEqual({ id: 'rec-1', mileage: 88450 })
    expect(stored.diagnosticNotes).toBe('<p>Pads worn</p><p>Customer hears a rattle</p>')
    expect(stored.mileage).toBe(88450)
  })

  it('sends no money: the server totals the job from what it stores', async () => {
    const a = openTab()
    act(() => a.page().dirtySetDiscountType('percentage'))
    act(() => a.page().dirtySetDiscountValue(10))
    await a.save()

    expect(sent()).toEqual({ id: 'rec-1', discountType: 'percentage', discountValue: 10 })
    for (const money of ['subtotal', 'taxAmount', 'totalAmount', 'discountAmount', 'cost']) {
      expect(sent()).not.toHaveProperty(money)
    }
  })

  it('gives a field saved in both tabs to the later save, and tells the other tab', async () => {
    const a = openTab()
    const b = openTab()

    b.writeNote('diagnosticNotes', '<p>From tab B</p>')
    await b.save()
    // Tab A is typing in the same note when B's save reaches it.
    a.writeNote('diagnosticNotes', '<p>From tab A</p>')
    a.refresh()
    // A keeps what is being typed, and is told its save will replace B's.
    expect(a.page().notesRef.current.diagnosticNotes).toBe('<p>From tab A</p>')
    expect(a.page().changedElsewhere).toEqual({ kept: ['diagnosticNotes'], replaced: [] })

    await a.save()
    expect(stored.diagnosticNotes).toBe('<p>From tab A</p>')
    // Said and done: the notice goes once A's save is through.
    expect(a.page().changedElsewhere).toEqual({ kept: [], replaced: [] })

    // B hears of A's save: it shows A's note, and is told its own was replaced.
    b.refresh()
    expect(b.page().notesRef.current.diagnosticNotes).toBe('<p>From tab A</p>')
    expect(b.page().adoptedFields.diagnosticNotes).toEqual({ value: '<p>From tab A</p>' })
    expect(b.page().changedElsewhere).toEqual({ kept: [], replaced: ['diagnosticNotes'] })

    render(
      <ChangedElsewhereBanner
        kept={b.page().changedElsewhere.kept}
        replaced={b.page().changedElsewhere.replaced}
        onDismiss={() => b.page().dismissChangedElsewhere()}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('Changed elsewhere: Internal notes.')
    expect(screen.getByRole('status')).toHaveTextContent(
      'A later save replaced your change. This page now shows the newer version.'
    )
  })

  it('takes every field it has not touched from the job as saved elsewhere, mid-edit', async () => {
    const a = openTab()
    const b = openTab()

    // A is part-way through the mileage, not yet saved.
    a.type('mileage', '91000')
    // B saves the stage, a discount, the notes and the invoice number.
    act(() => {
      b.page().dirtySetStatus('waiting-parts')
      b.page().dirtySetDiscountType('fixed')
      b.page().dirtySetDiscountValue(50)
    })
    b.writeNote('invoiceNotes', '<p>Parts ordered</p>')
    b.type('invoiceNumber', 'ZZ-2002')
    await b.save()

    a.refresh()
    const page = a.page()
    expect(page.status).toBe('waiting-parts')
    expect(page.discountType).toBe('fixed')
    expect(page.discountValue).toBe(50)
    expect(page.notesRef.current.invoiceNotes).toBe('<p>Parts ordered</p>')
    expect(page.adoptedFields.invoiceNotes).toEqual({ value: '<p>Parts ordered</p>' })
    expect(a.input('invoiceNumber').value).toBe('ZZ-2002')
    // What A is typing stays, still unsaved, and nothing was taken from it.
    expect(a.input('mileage').value).toBe('91000')
    expect(page.hasUnsavedChanges).toBe(true)
    expect(page.changedElsewhere).toEqual({ kept: [], replaced: [] })

    await a.save()
    expect(sent()).toEqual({ id: 'rec-1', mileage: 91000 })
    expect(stored).toMatchObject({
      status: 'waiting-parts',
      discountType: 'fixed',
      discountValue: 50,
      invoiceNotes: '<p>Parts ordered</p>',
      invoiceNumber: 'ZZ-2002',
      mileage: 91000,
    })
  })

  it('takes a line added elsewhere into a list it has not touched, and does not send the lines', async () => {
    const a = openTab()
    a.writeNote('diagnosticNotes', '<p>Checked the rotors</p>')
    const fromTheBay = { ...DIAGNOSIS, description: 'ZZ Replaced pads', total: 150, hours: 1.5 }
    stored = { ...stored, laborItems: [DIAGNOSIS, fromTheBay] }
    a.refresh()

    expect(a.page().laborItems).toEqual([DIAGNOSIS, fromTheBay])
    expect(a.page().laborAddedElsewhere).toEqual([])
    await a.save()
    expect(sent()).toEqual({ id: 'rec-1', diagnosticNotes: '<p>Checked the rotors</p>' })
    expect(stored.laborItems).toEqual([DIAGNOSIS, fromTheBay])
  })

  it('sends its lines when it changed them, with a line added elsewhere among them', async () => {
    const a = openTab()
    const road = { ...DIAGNOSIS, description: 'ZZ Road test' }
    act(() => a.page().dirtySetLaborItems((prev) => [...prev, road]))
    const fromTheBay = { ...DIAGNOSIS, description: 'ZZ Replaced pads' }
    stored = { ...stored, laborItems: [DIAGNOSIS, fromTheBay] }
    a.refresh()
    expect(a.page().laborAddedElsewhere).toEqual([fromTheBay])

    await a.save()
    expect(sent().laborItems).toEqual([DIAGNOSIS, road, fromTheBay])
    expect(sent()).not.toHaveProperty('partItems')
  })
})
