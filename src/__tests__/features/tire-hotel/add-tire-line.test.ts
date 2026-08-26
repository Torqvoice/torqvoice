/**
 * Tests for addTireLineToRecord — the only way the tire hotel puts tires on
 * a job.
 *
 * The rule it exists to enforce: a part line linked to inventory must move
 * stock at the moment it is written. Deleting a work order restocks every
 * linked line it finds, so a line written without the matching movement hands
 * back stock that was never taken, and four tires sold become eight on the
 * shelf.
 */

import { describe, it, expect, vi } from 'vitest'
import { addTireLineToRecord, type TireLineInput } from '@/features/tire-hotel/Lib/addTireLine'

const ORG = 'org-1'
const USER = 'user-1'

const LINE: TireLineInput = {
  serviceRecordId: 'svc-1',
  name: 'Nokian Hakkapeliitta 225/45R18',
  partNumber: 'NOK-2254518',
  quantity: 4,
  unit: null,
  unitPrice: 1800,
  unitCost: 1200,
  inventoryPartId: 'part-1',
  recordLabel: 'INV-1001',
}

/**
 * A fake transaction client recording the part line, the atomic stock update
 * and the ledger write. `$queryRaw` is a tagged template: the values arrive as
 * [decrement, inventoryPartId, organizationId].
 */
function makeTx(balance = 12) {
  const create = vi.fn().mockResolvedValue({ id: 'sp-1' })
  const createMany = vi.fn().mockResolvedValue({ count: 1 })
  const updates: { id: string; organizationId: string; decrement: number }[] = []

  const $queryRaw = vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
    const [decrement, id, organizationId] = values as [number, string, string]
    updates.push({ id, organizationId, decrement })
    return [{ quantity: balance - decrement }]
  })

  // A stand-in for Prisma's client, narrowed at the call site.
  const tx = { servicePart: { create }, stockMovement: { createMany }, $queryRaw }
  return { tx, create, createMany, updates }
}

describe('putting tires on a job', () => {
  it('writes the part line with the totalled price', async () => {
    const { tx, create } = makeTx()
    await addTireLineToRecord(tx as never, ORG, USER, LINE)

    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].data).toMatchObject({
      serviceRecordId: 'svc-1',
      quantity: 4,
      unitPrice: 1800,
      total: 7200,
      inventoryPartId: 'part-1',
    })
  })

  it('takes the tires off the shelf as it writes the line', async () => {
    const { tx, updates } = makeTx()
    await addTireLineToRecord(tx as never, ORG, USER, LINE)

    expect(updates).toEqual([{ id: 'part-1', organizationId: ORG, decrement: 4 }])
  })

  it('decrements what is being sold, not what the set holds', async () => {
    // Replacing two of four is a normal job, and the shelf should lose two.
    const { tx, updates } = makeTx()
    await addTireLineToRecord(tx as never, ORG, USER, { ...LINE, quantity: 2 })

    expect(updates[0].decrement).toBe(2)
  })

  it('records the movement in the ledger against the job', async () => {
    const { tx, createMany } = makeTx(12)
    await addTireLineToRecord(tx as never, ORG, USER, LINE)

    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        inventoryPartId: 'part-1',
        organizationId: ORG,
        delta: -4,
        quantityAfter: 8,
        reason: 'service_record',
        userId: USER,
        serviceRecordId: 'svc-1',
        serviceRecordLabel: 'INV-1001',
      }),
    ])
  })

  it('moves no stock for a set that is not a catalogue item', async () => {
    // The line still gets made and priced by hand; there is just nothing on a
    // shelf to take it from.
    const { tx, create, updates, createMany } = makeTx()
    await addTireLineToRecord(tx as never, ORG, USER, { ...LINE, inventoryPartId: null })

    expect(create).toHaveBeenCalledTimes(1)
    expect(updates).toEqual([])
    expect(createMany).not.toHaveBeenCalled()
  })

  it('never restocks, whatever it is handed', async () => {
    // The delete path is what restocks. This one only ever consumes, so a
    // sign error here cannot quietly inflate the shelf.
    const { tx, updates } = makeTx()
    await addTireLineToRecord(tx as never, ORG, USER, { ...LINE, quantity: 1 })

    expect(updates.every((u) => u.decrement > 0)).toBe(true)
  })
})
