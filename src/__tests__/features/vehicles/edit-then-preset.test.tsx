/**
 * A line edited, then a labour preset applied before the edit has settled.
 *
 * The page saves by itself five seconds after an edit and reads the job again
 * after every save. A preset picked while that save runs, or before the read
 * after it comes back, leaves the page unsaved when the saved lines arrive.
 * The page used to compare them with the lines as they were before the save,
 * took the line it had just saved for one a technician added elsewhere, put
 * it in the list a second time, and the next save wrote it twice.
 *
 * The page and the save are the real hooks here, wired as ServicePageClient
 * wires them; only the server action and the router are stand-ins.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceLaborInput, ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'

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

import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'

const labor = (description: string, hours = 1, rate = 100): ServiceLaborInput => ({
  description,
  hours,
  rate,
  total: hours * rate,
  pricingType: 'hourly',
})
const part = (name: string, unitPrice = 50): ServicePartInput => ({
  name,
  partNumber: '',
  quantity: 1,
  unitPrice,
  total: unitPrice,
  unitCost: 0,
  markupPercent: 0,
  inventoryPartId: '',
})

const ORIGINAL = labor('ZZ Repro', 1)
const EDITED = labor('ZZ Repro B', 1.5)
const PRESET = labor('ZZ Oil service', 0.5)
const PRESET_PART = part('ZZ Oil filter', 12)
const DESK_PART = part('ZZ Brake cleaner', 8)
const EDITED_PART = part('ZZ Brake cleaner, 2 cans', 16)
const FROM_THE_BAY = labor('ZZ Replaced the timing belt', 2)

function props(laborItems: ServiceLaborInput[], partItems: ServicePartInput[] = [DESK_PART]) {
  return {
    vehicleId: 'veh-1',
    defaultTaxRate: 0,
    currentUserName: 'Desk',
    record: { id: 'rec-1', attachments: [], payments: [] } as never,
    initialData: {
      id: 'rec-1',
      status: 'in-progress',
      concerns: [],
      partItems,
      laborItems,
      taxRate: 0,
      taxInclusive: false,
      discountValue: 0,
    } as never,
  }
}

/** The work order page: its form state and its save, as ServicePageClient wires them. */
function openPage() {
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
    { initialProps: props([ORIGINAL]) }
  )
  const el = document.createElement('form')
  el.innerHTML = '<input name="title" value="ZZ Brake inspection" />'
  document.body.appendChild(el)
  const submit = () =>
    hook.result.current.actions.handleSubmit({
      preventDefault: () => undefined,
      currentTarget: el,
    } as unknown as React.FormEvent<HTMLFormElement>)
  const page = () => hook.result.current.formState
  /** The read of the job after a save comes back with what the server holds. */
  const refresh = (laborItems: ServiceLaborInput[], partItems?: ServicePartInput[]) =>
    hook.rerender(props(laborItems, partItems))
  return { page, submit, refresh }
}

/** The save the server is running, held open until the test lets it finish. */
function heldSave() {
  let finish: () => void = () => undefined
  updateServiceRecord.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ success: true })
      })
  )
  return () => finish()
}

const sent = (call = -1) =>
  updateServiceRecord.mock.calls.at(call)?.[0] as {
    laborItems: ServiceLaborInput[]
    partItems: ServicePartInput[]
  }

const applyPreset = (page: ReturnType<typeof openPage>['page']) =>
  act(() => {
    page().dirtySetLaborItems((prev) => [PRESET, ...prev])
    page().dirtySetPartItems((prev) => [PRESET_PART, ...prev])
  })

beforeEach(() => {
  updateServiceRecord.mockReset().mockResolvedValue({ success: true })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('a preset applied right after a line was edited', () => {
  it('while the autosave of the edit runs: the edited line shows and saves once', async () => {
    const { page, submit, refresh } = openPage()

    act(() => {
      page().dirtySetLaborItems([EDITED])
      page().dirtySetPartItems([EDITED_PART])
    })
    const finish = heldSave()
    let saving: Promise<void> = Promise.resolve()
    act(() => {
      saving = submit()
    })
    applyPreset(page)
    await act(async () => {
      finish()
      await saving
    })
    // The read after the save: the server has the edits, not the preset yet.
    refresh([EDITED], [EDITED_PART])

    expect(page().laborItems).toEqual([PRESET, EDITED])
    expect(page().laborAddedElsewhere).toEqual([])
    expect(page().partItems).toEqual([PRESET_PART, EDITED_PART])
    expect(page().partsAddedElsewhere).toEqual([])

    await act(() => submit())
    expect(sent().laborItems).toEqual([PRESET, EDITED])
    expect(sent().partItems).toEqual([PRESET_PART, EDITED_PART])
  })

  it('after the save, before the read that follows it: the same', async () => {
    const { page, submit, refresh } = openPage()

    act(() => page().dirtySetLaborItems([EDITED]))
    await act(() => submit())
    expect(page().hasUnsavedChanges).toBe(false)
    applyPreset(page)
    refresh([EDITED], [DESK_PART])

    expect(page().laborItems).toEqual([PRESET, EDITED])
    expect(page().laborAddedElsewhere).toEqual([])
    expect(page().partsAddedElsewhere).toEqual([])

    await act(() => submit())
    expect(sent().laborItems).toEqual([PRESET, EDITED])
    expect(sent().partItems).toEqual([PRESET_PART, DESK_PART])
  })

  it('a technician line that arrives after that save still waits for the desk and is saved', async () => {
    const { page, submit, refresh } = openPage()

    act(() => page().dirtySetLaborItems([EDITED]))
    const finish = heldSave()
    let saving: Promise<void> = Promise.resolve()
    act(() => {
      saving = submit()
    })
    applyPreset(page)
    await act(async () => {
      finish()
      await saving
    })
    refresh([EDITED, FROM_THE_BAY], [DESK_PART])

    expect(page().laborItems).toEqual([PRESET, EDITED])
    expect(page().laborAddedElsewhere).toEqual([FROM_THE_BAY])

    await act(() => submit())
    expect(sent().laborItems).toEqual([PRESET, EDITED, FROM_THE_BAY])
  })
})

const SECOND_FROM_THE_BAY = labor('ZZ Brake fluid flush', 0.5)
const SCANNED = part('ZZ Front pads', 72)
const SECOND_SCANNED = part('ZZ Wear sensor', 15)

/** Edit, save (held open), and apply a preset while it runs, so the page stays unsaved. */
function editSaveAndPreset() {
  const view = openPage()
  act(() => view.page().dirtySetLaborItems([EDITED]))
  const finish = heldSave()
  let saving: Promise<void> = Promise.resolve()
  act(() => {
    saving = view.submit()
  })
  applyPreset(view.page)
  const land = () =>
    act(async () => {
      finish()
      await saving
    })
  return { ...view, land }
}

describe('lines a technician adds while a save runs', () => {
  it('a read taken after the save wrote: each line waits once and is saved once', async () => {
    const { page, submit, refresh, land } = editSaveAndPreset()

    // The technician's line and part, read with the desk's own edit already on the server.
    refresh([EDITED, FROM_THE_BAY], [DESK_PART, SCANNED])
    expect(page().laborAddedElsewhere).toEqual([FROM_THE_BAY])
    expect(page().partsAddedElsewhere).toEqual([SCANNED])

    await land()
    // Another line and part arrive; the first ones are still on the job.
    refresh([EDITED, FROM_THE_BAY, SECOND_FROM_THE_BAY], [DESK_PART, SCANNED, SECOND_SCANNED])
    expect(page().laborAddedElsewhere).toEqual([FROM_THE_BAY, SECOND_FROM_THE_BAY])
    expect(page().partsAddedElsewhere).toEqual([SCANNED, SECOND_SCANNED])

    await act(() => submit())
    expect(sent().laborItems).toEqual([PRESET, EDITED, FROM_THE_BAY, SECOND_FROM_THE_BAY])
    expect(sent().partItems).toEqual([PRESET_PART, DESK_PART, SCANNED, SECOND_SCANNED])
  })

  it('a read taken before the save wrote: the old line is not offered, the new one is saved once', async () => {
    const { page, submit, refresh, land } = editSaveAndPreset()

    refresh([ORIGINAL, FROM_THE_BAY])
    expect(page().laborAddedElsewhere).toEqual([FROM_THE_BAY])

    await land()
    // The save replaced every line, so the server lost the technician's line
    // for now; the page still holds it, and the next save puts it back.
    refresh([EDITED])
    expect(page().laborAddedElsewhere).toEqual([FROM_THE_BAY])
    refresh([EDITED, SECOND_FROM_THE_BAY])
    expect(page().laborAddedElsewhere).toEqual([FROM_THE_BAY, SECOND_FROM_THE_BAY])

    await act(() => submit())
    expect(sent().laborItems).toEqual([PRESET, EDITED, FROM_THE_BAY, SECOND_FROM_THE_BAY])
  })
})

describe('saved lines compared as the server returns them', () => {
  it('hours typed as text, and a preset part with empty links, are not read as added elsewhere', async () => {
    const { page, submit, refresh } = openPage()

    // Typed into the boxes: the editor keeps the strings.
    act(() => {
      page().updateLabor(0, 'description', 'ZZ Repro B')
      page().updateLabor(0, 'hours', '1.5')
    })
    expect(page().laborItems[0].hours).toBe('1.5')
    // A preset part carries '' for its part number and inventory link.
    act(() => page().dirtySetPartItems((prev) => [PRESET_PART, ...prev]))
    const finish = heldSave()
    let saving: Promise<void> = Promise.resolve()
    act(() => {
      saving = submit()
    })
    // Edited while it runs, so the page is unsaved when the read comes back.
    act(() => page().dirtySetLaborItems((prev) => [...prev, PRESET]))
    await act(async () => {
      finish()
      await saving
    })
    // What the server hands back: numbers, and no inventory link at all.
    refresh([EDITED], [{ ...PRESET_PART, inventoryPartId: undefined }, DESK_PART])

    expect(page().laborAddedElsewhere).toEqual([])
    expect(page().partsAddedElsewhere).toEqual([])
    await act(() => submit())
    expect(sent().laborItems.map((l) => l.description)).toEqual(['ZZ Repro B', 'ZZ Oil service'])
    expect(sent().partItems.map((p) => p.name)).toEqual(['ZZ Oil filter', 'ZZ Brake cleaner'])
  })
})
