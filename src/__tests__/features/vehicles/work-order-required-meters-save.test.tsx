/**
 * The work order's save refused for readings the workshop requires.
 *
 * The stage goes back to where it was, unless the person picked another one
 * while the save was on its way: that choice is newer, and is what the next
 * save sends. A save they asked for takes them to the first empty meter box;
 * the five-second autosave only marks the boxes, since the person is typing
 * somewhere and their next keys must not land in a reading.
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
import {
  onRevealRequiredMeters,
  type RevealOptions,
} from '@/features/meters/Lib/requiredMetersReveal'

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

const PTO = { vehicleMeterId: 'vm-pto', meterTypeId: 't-pto', name: 'PTO hours', item: null }
const REFUSED = {
  success: false,
  error: 'Not completed. Fill in: PTO hours',
  requiredMeters: [PTO],
}

const reveals: { ids: string[]; options: RevealOptions }[] = []
let stopListening: () => void = () => undefined

afterEach(() => {
  stopListening()
  cleanup()
  document.body.innerHTML = ''
})

beforeEach(() => {
  reveals.length = 0
  stopListening = onRevealRequiredMeters('job1', (ids, options) => reveals.push({ ids, options }))
  saveServiceRecordChanges.mockReset().mockResolvedValue(REFUSED)
})

/** The page with a stage picked: `status` sent, `saved` the stage the job is at. */
function page(status: string, saved: string) {
  // The stage as the page holds it, which the refusal's updater is run against.
  const stage = { current: status }
  const form = {
    selectedVehicleId: 'v1',
    type: 'repair',
    status,
    setStatus: vi.fn((next: string | ((current: string) => string)) => {
      stage.current = typeof next === 'function' ? next(stage.current) : next
    }),
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
    initialData: { id: 'job1', status: saved, mileage: null, lastReading: null },
    confirmedReadingRef: { current: null },
    acknowledgeSavedLines: vi.fn(),
    sendingLinesRef: { current: null },
    partsAddedElsewhere: [],
    laborAddedElsewhere: [],
    fieldChanges: () => fieldChanges(form),
    acknowledgeSavedFields: vi.fn(),
    beginFieldSave: vi.fn(),
    lineEditsForSave: () => ({
      parts: false,
      labor: false,
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
  const el = document.createElement('form')
  el.innerHTML = '<input name="title" value="ZZ Service" />'
  document.body.appendChild(el)

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
  return { form, save, stage }
}

describe('a completion refused for readings', () => {
  it('puts the stage back and queues the rest of the work order for the next save', async () => {
    const { form, save, stage } = page('completed', 'in-progress')
    await save()
    expect(stage.current).toBe('in-progress')
    expect(form.markDirty).toHaveBeenCalledTimes(1)
    expect(form.markSaved).not.toHaveBeenCalled()
  })

  it('keeps a stage picked while the save was on its way', async () => {
    const { form, save, stage } = page('completed', 'in-progress')
    saveServiceRecordChanges.mockImplementationOnce(async () => {
      // The person picks "Waiting for parts" while the save runs.
      stage.current = 'waiting-parts'
      form.editRevisionRef.current += 1
      return REFUSED
    })
    await save({ autosave: true })
    expect(stage.current).toBe('waiting-parts')
    // That pick queued its own save already.
    expect(form.markDirty).not.toHaveBeenCalled()
  })

  it('takes the person to the first empty box for a save they asked for', async () => {
    const { save } = page('completed', 'in-progress')
    await save()
    expect(reveals).toEqual([{ ids: ['vm-pto'], options: { focus: true } }])
  })

  it('only marks the boxes for the autosave, or a save a link is waiting on', async () => {
    const first = page('completed', 'in-progress')
    await first.save({ autosave: true })
    await first.save({ leaving: true })
    expect(reveals).toEqual([
      { ids: ['vm-pto'], options: { focus: false } },
      { ids: ['vm-pto'], options: { focus: false } },
    ])
  })
})

describe('a completed job moved to a vehicle whose readings are missing', () => {
  it('is refused without queueing a save that could only be refused again', async () => {
    saveServiceRecordChanges.mockResolvedValue({ ...REFUSED, error: 'Not moved.' })
    const { form, save, stage } = page('completed', 'completed')
    await save({ autosave: true })
    expect(stage.current).toBe('completed')
    expect(form.markDirty).not.toHaveBeenCalled()
    // Still unsaved, and the reason is kept for a link that waits on it.
    expect(form.markSaved).not.toHaveBeenCalled()
    expect(form.lastSaveErrorRef.current).toBe('Not moved.')
  })
})
