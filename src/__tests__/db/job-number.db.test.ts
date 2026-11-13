/**
 * The next job number on a real PostgreSQL (`npm run test:db` with
 * E2E_DATABASE_URL set).
 *
 * The unit tests mock the query that finds the highest number already issued
 * in the workshop's format. This runs it: a pattern PostgreSQL reads
 * differently from JavaScript, or a parameter it takes for a number, fails
 * here instead of on a workshop's next job.
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
const OSLO = 'Europe/Oslo'
/** 13 November 2026 in Oslo. */
const NOW = new Date('2026-11-13T09:00:00Z')

let db: typeof import('@/lib/db')['db']
let nextJobNumber: typeof import('@/lib/job-number')['nextJobNumber']
let clearNextNumberSetting: typeof import('@/lib/job-number')['clearNextNumberSetting']
let organizationId = ''
let userId = ''

/** Jobs in the order they were opened, the last one the newest. */
const NUMBERS: (string | null)[] = [
  '2025-1050',
  '2026-1071',
  '2026-1060',
  'INV/2026.11-7',
  // Looks like the INV format, but the dot is not a dot.
  'INV/2026x11-9',
  // Longer than any integer column or JavaScript number holds exactly.
  'BIG-99999999999999999999',
  'XT-1018',
  // An online booking: no number at all.
  null,
]

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ nextJobNumber, clearNextNumberSetting } = await import('@/lib/job-number'))
  const user = await db.user.create({
    data: { name: `Numbering ${stamp}`, email: `numbering-${stamp}@example.com` },
  })
  userId = user.id
  const organization = await db.organization.create({ data: { name: `Numbering ${stamp}` } })
  organizationId = organization.id
  for (const [i, invoiceNumber] of NUMBERS.entries()) {
    await db.serviceRecord.create({
      data: {
        title: `Job ${i}`,
        organizationId,
        invoiceNumber,
        createdAt: new Date(Date.UTC(2026, 10, 1, 8, i)),
      },
    })
  }
})

afterAll(async () => {
  // The jobs and settings go with the workshop.
  if (organizationId) await db.organization.deleteMany({ where: { id: organizationId } })
  if (userId) await db.user.deleteMany({ where: { id: userId } })
})

function numbered(settings: Record<string, string>) {
  return nextJobNumber({ organizationId, settings, timeZone: OSLO, now: NOW })
}
async function next(settings: Record<string, string>) {
  return (await numbered(settings)).invoiceNumber
}

describe('the next job number on PostgreSQL', () => {
  it('continues past the highest number in the format, whatever the newest job says', async () => {
    expect(await next({ 'workshop.invoicePrefix': '{year}-' })).toBe('2026-1072')
  })

  it('reads the rest of the format literally', async () => {
    expect(await next({ 'workshop.invoicePrefix': 'INV/{year}.{month}-' })).toBe('INV/2026.11-8')
  })

  it('reads and counts a running number of any length', async () => {
    expect(await next({ 'workshop.invoicePrefix': 'BIG-' })).toBe('BIG-100000000000000000000')
  })

  it('continues from the newest numbered job in a format with no numbers yet', async () => {
    expect(await next({ 'workshop.invoicePrefix': 'WO-' })).toBe('WO-1019')
  })

  it('uses "Next invoice number", which the job write then clears in its transaction', async () => {
    await db.appSetting.create({
      data: { organizationId, userId, key: 'workshop.invoiceStartNumber', value: '5000' },
    })
    const where = { organizationId_key: { organizationId, key: 'workshop.invoiceStartNumber' } }

    expect(
      await numbered({ 'workshop.invoicePrefix': '{year}-', 'workshop.invoiceStartNumber': '5000' })
    ).toEqual({ invoiceNumber: '2026-5000', usesNextNumberSetting: true })
    // Not spent until the job is written.
    expect((await db.appSetting.findUnique({ where }))?.value).toBe('5000')

    await db.$transaction(async (tx) => {
      await tx.serviceRecord.create({
        data: { title: 'The 5000 job', organizationId, invoiceNumber: '2026-5000' },
      })
      await clearNextNumberSetting(organizationId, tx)
    })

    expect((await db.appSetting.findUnique({ where }))?.value).toBe('')
    expect(await next({ 'workshop.invoicePrefix': '{year}-' })).toBe('2026-5001')
  })
})
