/**
 * Parts that do not track stock, on a real PostgreSQL (`npm run test:db`
 * with E2E_DATABASE_URL set).
 *
 * A workshop keeps a consumables fee as a part so it can go on every job.
 * Counted like a filter, it sinks further below zero with each one. The rule
 * that stops that lives in the SQL of the stock helper, which the unit tests
 * mock, so this runs it: what the part's quantity and its ledger look like
 * after a job uses it, hands it back, and after tracking is switched off.
 *
 * It makes one person and one workshop of its own and removes them again; it
 * empties nothing.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}

// Set before the app's modules load, so the client connects to the test database.
process.env.DATABASE_URL = url

const stamp = randomUUID().slice(0, 8)

let db: typeof import('@/lib/db')['db']
let stock: typeof import('@/features/inventory/Lib/reconcileStock')
let organizationId = ''
let userId = ''

const JOB = { reason: 'service_record' as const, serviceRecordLabel: 'WO-1' }

async function makePart(name: string, data: { quantity?: number; trackStock?: boolean }) {
  const part = await db.inventoryPart.create({
    data: { name: `${name} ${stamp}`, userId, organizationId, ...data },
  })
  return part.id
}

async function quantityOf(id: string) {
  const part = await db.inventoryPart.findUniqueOrThrow({ where: { id } })
  return part.quantity
}

function ledgerOf(id: string) {
  return db.stockMovement.findMany({
    where: { inventoryPartId: id },
    orderBy: { createdAt: 'asc' },
  })
}

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  stock = await import('@/features/inventory/Lib/reconcileStock')
  const user = await db.user.create({
    data: { name: `Stock ${stamp}`, email: `stock-${stamp}@example.com` },
  })
  userId = user.id
  const organization = await db.organization.create({ data: { name: `Stock ${stamp}` } })
  organizationId = organization.id
})

afterAll(async () => {
  // The parts and their ledger go with the workshop.
  if (organizationId) await db.organization.delete({ where: { id: organizationId } })
  if (userId) await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})

describe('a part that does not track stock', () => {
  it('keeps its quantity and gets no ledger row when a job uses it', async () => {
    const fee = await makePart('Consumables', { trackStock: false })
    const filter = await makePart('Oil filter', { quantity: 10 })

    await db.$transaction((tx) =>
      stock.reconcileInventoryForParts(
        tx,
        organizationId,
        [],
        [
          { inventoryPartId: fee, quantity: 1 },
          { inventoryPartId: filter, quantity: 2 },
        ],
        JOB
      )
    )

    expect(await quantityOf(fee)).toBe(0)
    expect(await ledgerOf(fee)).toEqual([])
    // The counted part on the same job still moves.
    expect(await quantityOf(filter)).toBe(8)
    expect(await ledgerOf(filter)).toHaveLength(1)
  })

  it('gains nothing when the line is taken off the job again', async () => {
    const fee = await makePart('Environmental fee', { trackStock: false })

    await db.$transaction((tx) =>
      stock.reconcileInventoryForParts(
        tx,
        organizationId,
        [{ inventoryPartId: fee, quantity: 3 }],
        [],
        { reason: 'service_record_deleted' }
      )
    )

    expect(await quantityOf(fee)).toBe(0)
    expect(await ledgerOf(fee)).toEqual([])
  })
})

describe('turning stock tracking off', () => {
  it('takes a negative quantity to zero with one ledger entry saying why', async () => {
    const fee = await makePart('Shop supplies', { quantity: 0 })
    // Forty jobs' worth, back when it was counted.
    await db.$transaction((tx) =>
      stock.reconcileInventoryForParts(
        tx,
        organizationId,
        [],
        [{ inventoryPartId: fee, quantity: 40 }],
        JOB
      )
    )
    expect(await quantityOf(fee)).toBe(-40)

    await db.$transaction(async (tx) => {
      await stock.recordAbsoluteStockChange(tx, organizationId, fee, 0, {
        reason: 'stock_tracking_off',
        userId,
      })
      await tx.inventoryPart.update({ where: { id: fee }, data: { trackStock: false } })
    })

    expect(await quantityOf(fee)).toBe(0)
    const ledger = await ledgerOf(fee)
    expect(ledger).toHaveLength(2)
    expect(ledger[1]).toMatchObject({
      reason: 'stock_tracking_off',
      delta: 40,
      quantityAfter: 0,
      userId,
    })

    // From here on a job leaves it alone.
    await db.$transaction((tx) =>
      stock.reconcileInventoryForParts(
        tx,
        organizationId,
        [],
        [{ inventoryPartId: fee, quantity: 1 }],
        JOB
      )
    )
    expect(await quantityOf(fee)).toBe(0)
    expect(await ledgerOf(fee)).toHaveLength(2)
  })
})
