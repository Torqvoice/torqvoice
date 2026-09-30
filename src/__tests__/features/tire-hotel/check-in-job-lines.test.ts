/**
 * What storing tires from a work order puts on that work order.
 *
 * Check-in from a job used to link the set and charge nothing, so the storage
 * fee only reached a bill if somebody remembered to go to the set's page and
 * raise it from there. The dialog now offers the charge in the same save.
 * These pin the rules that make that safe: prep is priced from settings and
 * never from the form, work nobody asked for cannot be billed, and nothing is
 * written when there is nothing to charge.
 */

import { it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { appSetting: { findUnique: vi.fn() } } }))
vi.mock('@/features/tire-hotel/Lib/serverMessages', () => ({
  invoiceLineWords: vi.fn(async () => ({
    storage: 'Tire storage',
    pieces: 'pcs',
    fromDate: 'from {date}',
  })),
  treatmentNames: vi.fn(async () => ({ wash_tires: 'Wash tires', balance: 'Balancing' })),
}))
vi.mock('@/features/vehicles/Lib/retotalServiceRecord', () => ({
  retotalServiceRecord: vi.fn(),
}))

import { db } from '@/lib/db'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { addLinesToJob, checkInJobLines } from '@/features/tire-hotel/Lib/jobLines'

const ORG = 'org-1'
const SET = { size: '225/45R17', quantity: 4 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.appSetting.findUnique).mockResolvedValue({
    value: JSON.stringify({ wash_tires: 150, balance: 400 }),
  } as never)
})

it('adds nothing when the desk asked for nothing', async () => {
  expect(await checkInJobLines(ORG, SET, ['wash_tires'], null)).toEqual([])
  expect(await checkInJobLines(ORG, SET, ['wash_tires'], {})).toEqual([])
})

it('prices prep from settings, as flat service lines', async () => {
  const lines = await checkInJobLines(ORG, SET, ['wash_tires', 'balance'], {
    treatments: ['wash_tires', 'balance'],
  })

  expect(lines).toEqual([
    { description: 'Wash tires', hours: 1, rate: 150, total: 150, pricingType: 'service' },
    { description: 'Balancing', hours: 1, rate: 400, total: 400, pricingType: 'service' },
  ])
})

it('bills only the prep that was ticked', async () => {
  const lines = await checkInJobLines(ORG, SET, ['wash_tires', 'balance'], {
    treatments: ['balance'],
  })

  expect(lines.map((line) => line.description)).toEqual(['Balancing'])
})

it('will not bill work that was never asked for on the set', async () => {
  const lines = await checkInJobLines(ORG, SET, ['wash_tires'], { treatments: ['balance'] })

  expect(lines).toEqual([])
})

it('leaves prep the shop has not priced off the job', async () => {
  vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: '{}' } as never)

  const lines = await checkInJobLines(ORG, SET, ['wash_tires'], { treatments: ['wash_tires'] })

  expect(lines).toEqual([])
})

it('charges storage at the figure the desk settled on, open-ended from today', async () => {
  const [line] = await checkInJobLines(ORG, SET, [], { storageAmount: 1200 })
  const today = new Date().toISOString().slice(0, 10)

  expect(line).toMatchObject({ rate: 1200, total: 1200, hours: 1, pricingType: 'service' })
  expect(line?.description).toBe(`Tire storage · 225/45R17 · 4 pcs · from ${today}`)
})

it('writes the lines and retotals the job in the same transaction', async () => {
  const tx = { serviceLabor: { createMany: vi.fn() } }
  const lines = await checkInJobLines(ORG, SET, [], { storageAmount: 1200 })

  await addLinesToJob(tx as never, 'rec-1', lines)

  expect(tx.serviceLabor.createMany).toHaveBeenCalledWith({
    data: [expect.objectContaining({ serviceRecordId: 'rec-1', total: 1200 })],
  })
  expect(retotalServiceRecord).toHaveBeenCalledWith('rec-1', tx)
})

it('touches nothing on the job when there are no lines', async () => {
  const tx = { serviceLabor: { createMany: vi.fn() } }

  await addLinesToJob(tx as never, 'rec-1', [])

  expect(tx.serviceLabor.createMany).not.toHaveBeenCalled()
  expect(retotalServiceRecord).not.toHaveBeenCalled()
})
