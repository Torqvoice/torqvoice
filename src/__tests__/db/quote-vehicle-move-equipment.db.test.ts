/**
 * A quote moved to another vehicle, on a real PostgreSQL (`npm run test:db`):
 * the crane on the truck it left is no longer on the quote's page or on its
 * printout. The move runs through the same action the quote page saves with.
 *
 * It makes one person and one workshop of its own and removes them again.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const url = process.env.E2E_DATABASE_URL ?? ''
const databaseName = url.split('/').pop()?.split('?')[0]?.toLowerCase() ?? ''
if (url && !/test|e2e/.test(databaseName)) {
  throw new Error(
    `Refusing to use database "${databaseName}": its name must say test or e2e, like the rest of this suite.`
  )
}
process.env.DATABASE_URL = url

/** Who the action believes is signed in. */
const signedIn = vi.hoisted(() => ({ userId: '', organizationId: '' }))

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: async () => ({ user: { id: signedIn.userId, email: 'q@example.com' } }),
  getCachedMembership: async () => ({
    organizationId: signedIn.organizationId,
    role: 'owner',
    roleId: null,
    customRole: null,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
// Equipment is a custom-fields feature; this workshop has it.
vi.mock('@/lib/features', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/features')>()
  return {
    ...original,
    getFeatures: async (organizationId: string) => ({
      ...(await original.getFeatures(organizationId)),
      customFields: true,
    }),
  }
})

const stamp = randomUUID().slice(0, 8)
let db: typeof import('@/lib/db')['db']

beforeAll(async () => {
  if (!url) throw new Error('E2E_DATABASE_URL is not set')
  ;({ db } = await import('@/lib/db'))
  const user = await db.user.create({
    data: { name: `Quote move ${stamp}`, email: `quote-move-${stamp}@example.com` },
  })
  signedIn.userId = user.id
  const org = await db.organization.create({ data: { name: `Quote move ${stamp}` } })
  signedIn.organizationId = org.id
  await db.organizationMember.create({
    data: { userId: user.id, organizationId: org.id, role: 'owner' },
  })
})

afterAll(async () => {
  const organizationId = signedIn.organizationId
  await db.quote.deleteMany({ where: { organizationId } })
  await db.equipmentItem.deleteMany({ where: { organizationId } })
  await db.equipmentType.deleteMany({ where: { organizationId } })
  await db.vehicle.deleteMany({ where: { organizationId } })
  await db.organization.deleteMany({ where: { id: organizationId } })
  await db.user.deleteMany({ where: { id: signedIn.userId } })
})

describe('a quote moved to another vehicle', () => {
  it('no longer lists or prints the old vehicle’s equipment', async () => {
    const { updateQuote } = await import('@/features/quotes/Actions/quoteActions')
    const { quoteEquipmentView } = await import('@/features/equipment/Lib/equipment.server')
    const { printableEquipment } = await import('@/features/equipment/Lib/equipmentPrint.server')
    const organizationId = signedIn.organizationId
    const userId = signedIn.userId

    const truck = (model: string) =>
      db.vehicle.create({ data: { make: 'Volvo', model, year: 2019, userId, organizationId } })
    const truckA = await truck('FH')
    const truckB = await truck('FM')
    const type = await db.equipmentType.create({ data: { name: 'Crane', organizationId } })
    const item = (vehicleId: string, make: string) =>
      db.equipmentItem.create({ data: { make, typeId: type.id, vehicleId, organizationId } })
    const craneA = await item(truckA.id, 'Hiab')
    const liftB = await item(truckB.id, 'Palfinger')

    const quote = await db.quote.create({
      data: { title: 'Crane service', vehicleId: truckA.id, userId, organizationId },
    })
    await db.quoteEquipment.create({
      data: { quoteId: quote.id, itemId: craneA.id, organizationId },
    })
    const pickedOn = async (vehicleId: string | null) => ({
      page: (await quoteEquipmentView(organizationId, { id: quote.id, vehicleId }))?.selected ?? [],
      print: (await printableEquipment(organizationId, { quoteId: quote.id, vehicleId })).job,
    })

    // Before the move the crane is the quote's.
    const before = await pickedOn(truckA.id)
    expect(before.page).toEqual([craneA.id])
    expect(before.print.map((i) => i.make)).toEqual(['Hiab'])

    const result = await updateQuote({ id: quote.id, title: 'Crane service', vehicleId: truckB.id })
    expect(result.success).toBe(true)

    expect(await db.quoteEquipment.count({ where: { quoteId: quote.id } })).toBe(0)
    const after = await pickedOn(truckB.id)
    expect(after.page).toEqual([])
    expect(after.print).toEqual([])

    // A save that leaves the vehicle alone keeps a pick that moved on its own.
    await db.quoteEquipment.create({
      data: { quoteId: quote.id, itemId: liftB.id, organizationId },
    })
    await db.equipmentItem.update({ where: { id: liftB.id }, data: { vehicleId: truckA.id } })
    const renamed = await updateQuote({ id: quote.id, title: 'Crane service, again' })
    expect(renamed.success).toBe(true)
    expect(await db.quoteEquipment.count({ where: { quoteId: quote.id } })).toBe(1)
  })
})
