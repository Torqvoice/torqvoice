/**
 * A reading far above the last one, and the work order's save.
 *
 * The page saves by itself five seconds after an edit, so the question about
 * the reading is asked under the field (ReadingQuestion), not in a dialog.
 * Until it is answered, every save (the autosave, the Save button and the
 * save a link waits for) writes the rest of the work order and holds back
 * only the reading. The page stays unsaved and says why, so a link waiting
 * on the save asks the person to stay and answer.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/vehicles/v1/service/job1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
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

import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'
import {
  changedWorkOrderFields,
  savedWorkOrderFields,
  type WorkOrderFieldValues,
} from '@/features/vehicles/Lib/workOrderFields'

type Options = Parameters<typeof useServiceActions>[0]

/**
 * What the page changed, worked out as the real form state does it
 * (workOrderFields): the form's title and reading, and the stage, against the
 * job as saved.
 */
function fieldChanges(form: { status: string; initialData: object }) {
  const value = (name: string) =>
    document.querySelector<HTMLInputElement>(`form input[name="${name}"]`)?.value
  const current: Partial<WorkOrderFieldValues> = { status: form.status }
  const title = value('title')
  if (title !== undefined) current.title = title
  const mileage = value('mileage')
  if (mileage !== undefined) current.mileage = mileage === '' ? null : Number(mileage)
  const saved = savedWorkOrderFields(
    form.initialData as Parameters<typeof savedWorkOrderFields>[0],
    0
  )
  return { current, changed: changedWorkOrderFields(saved, current) }
}

const WAITING = 'The reading is not saved yet. Answer the question under it first.'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

beforeEach(() => {
  saveServiceRecordChanges.mockReset().mockResolvedValue({ success: true })
})

/** The work order as the page holds it: last reading 148,000, nothing saved on the job yet. */
function page(over: { confirmed?: number | null; saved?: number | null } = {}) {
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
    editRevisionRef: { current: 3 },
    customFieldsSaveRef: { current: null },
    setLoading: vi.fn(),
    setHasUnsavedChanges: vi.fn(),
    flashSaved: vi.fn(),
    markSaved: vi.fn(),
    markDirty: vi.fn(),
    notesRef: { current: { description: '', diagnosticNotes: '', invoiceNotes: '' } },
    initialData: { id: 'job1', mileage: over.saved ?? null, lastReading: 148000 },
    confirmedReadingRef: { current: over.confirmed ?? null },
    acknowledgeSavedLines: vi.fn(),
    sendingLinesRef: { current: null },
    partsAddedElsewhere: [],
    laborAddedElsewhere: [],
    fieldChanges: () => fieldChanges(form),
    acknowledgeSavedFields: vi.fn(),
    lineEditsForSave: () => ({
      parts: true,
      labor: true,
      partsRevision: 0,
      laborRevision: 0,
    }),
    settleLineEdits: vi.fn(),
  }
  const hook = renderHook(() =>
    useServiceActions({
      record: { id: 'job1' } as unknown as Options['record'],
      vehicleId: 'v1',
      currencyCode: 'GBP',
      formState: form as unknown as Options['formState'],
    })
  )

  // The page's form: the title and the reading as typed, and the question
  // under the reading.
  const el = document.createElement('form')
  el.innerHTML = `
    <input name="title" value="ZZ Brakes" />
    <input name="mileage" value="1490000" />
    <div id="reading-question"><button type="button" data-reading-confirm>Yes</button></div>`
  document.body.appendChild(el)
  const reading = el.querySelector<HTMLInputElement>('input[name="mileage"]') as HTMLInputElement

  const save = (how: { autosave?: boolean; leaving?: boolean } = {}) => {
    form.autosaveRunRef.current = how.autosave ?? false
    form.leavingRef.current = how.leaving ?? false
    return act(() =>
      hook.result.current.handleSubmit({
        preventDefault: () => undefined,
        currentTarget: el,
      } as unknown as React.FormEvent<HTMLFormElement>)
    )
  }
  return { form, save, reading }
}

const sent = () => saveServiceRecordChanges.mock.calls.at(-1)?.[0] as Record<string, unknown>

describe('a reading far above the last one, not yet answered', () => {
  it('an autosave writes the rest of the work order and not the reading', async () => {
    const { form, save } = page()
    await save({ autosave: true })
    expect(saveServiceRecordChanges).toHaveBeenCalledTimes(1)
    expect(sent()).toMatchObject({ id: 'job1', title: 'ZZ Brakes' })
    // Left out, the job keeps the reading it had.
    expect(sent().mileage).toBeUndefined()
    // The page stays unsaved, and says why.
    expect(form.markSaved).not.toHaveBeenCalled()
    expect(form.setHasUnsavedChanges).not.toHaveBeenCalled()
    expect(form.flashSaved).not.toHaveBeenCalled()
    expect(form.lastSaveErrorRef.current).toBe(WAITING)
    // Nothing moves the person away from what they are typing.
    expect(document.activeElement).toBe(document.body)
    expect(form.isSavingRef.current).toBe(false)
    // The lines it sent are the server's now: the refresh after the save must
    // not bring them back as lines added elsewhere, to be saved a second time.
    expect(form.acknowledgeSavedLines).toHaveBeenCalledWith({
      parts: sent().partItems,
      labor: sent().laborItems,
    })
  })

  it('the Save button does the same, and takes the person to the question', async () => {
    const { form, save } = page()
    await save()
    expect(sent().mileage).toBeUndefined()
    expect(sent().title).toBe('ZZ Brakes')
    expect(form.markSaved).not.toHaveBeenCalled()
    expect(document.activeElement).toHaveAttribute('data-reading-confirm')
  })

  it('a link waiting on the save is told why the page is still unsaved', async () => {
    const { form, save } = page()
    await save({ leaving: true })
    expect(sent().mileage).toBeUndefined()
    expect(form.markSaved).not.toHaveBeenCalled()
    // The leave dialog reads this and offers to stay.
    expect(form.lastSaveErrorRef.current).toBe(WAITING)
    expect(document.activeElement).toBe(document.body)
  })

  it('does not queue another autosave unless something else was edited meanwhile', async () => {
    const { form, save } = page()
    await save({ autosave: true })
    expect(form.markDirty).not.toHaveBeenCalled()

    // An edit made while the save ran is newer and gets a save of its own.
    saveServiceRecordChanges.mockImplementationOnce(async () => {
      form.editRevisionRef.current += 1
      return { success: true }
    })
    await save({ autosave: true })
    expect(form.markDirty).toHaveBeenCalledTimes(1)
  })
})

describe('once answered, or when nothing needs asking', () => {
  it('a reading the person said yes to is saved, and the page is saved', async () => {
    const { form, save } = page({ confirmed: 1490000 })
    await save({ autosave: true })
    expect(sent().mileage).toBe(1490000)
    expect(form.markSaved).toHaveBeenCalledWith(3)
    expect(form.lastSaveErrorRef.current).toBeNull()
  })

  it('a different far-higher value is held back again', async () => {
    const { save, reading } = page({ confirmed: 1490000 })
    reading.value = '1590000'
    await save({ autosave: true })
    expect(sent().mileage).toBeUndefined()
  })

  it('a reading changed back to a normal one is saved as usual', async () => {
    const { form, save, reading } = page()
    reading.value = '149000'
    await save({ autosave: true })
    expect(sent().mileage).toBe(149000)
    expect(form.markSaved).toHaveBeenCalled()
  })

  it('a reading already saved on the job is not asked about again', async () => {
    const { form, save } = page({ saved: 1490000 })
    await save({ autosave: true })
    // Not changed on this page, so not sent: the job keeps it as it is.
    expect(sent().mileage).toBeUndefined()
    expect(form.markSaved).toHaveBeenCalled()
  })
})
