/**
 * The report date filters on a real PostgreSQL (`npm run test:db` with
 * E2E_DATABASE_URL set).
 *
 * The unit tests check the filters' shape. This runs them: a job with an
 * invoice date counts on it, one without falls back to its start and then
 * its service date, and the end of the window is exclusive. A null that
 * Prisma reads differently from what the reports mean shows up here as a
 * job in the wrong report instead of in a workshop's tax return.
 *
 * It makes one workshop of its own and removes it again; it empties nothing.
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
let dates: typeof import('@/features/reports/Lib/reportDates')
let organizationId = ''

/** November 2026, end exclusive. */
const RANGE = { gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-12-01T00:00:00Z') }
const SEP = new Date('2026-09-10T10:00:00Z')
const OCT = new Date('2026-10-10T10:00:00Z')
const NOV = new Date('2026-11-10T10:00:00Z')

interface Row {
  title: string
  serviceDate: Date
  startDateTime: Date | null
  invoiceDate: Date | null
  manuallyPaid?: boolean
  manuallyPaidAt?: Date | null
  /** Counts in November by its document date (revenue, tax). */
  document: boolean
  /** Counts in November by its work date (jobs, hours, parts). */
  work: boolean
  /** Counts as marked paid by hand in November. */
  manual?: boolean
}

const ROWS: Row[] = [
  // Started in September, invoiced in November.
  {
    title: 'invoiced-in',
    serviceDate: SEP,
    startDateTime: SEP,
    invoiceDate: NOV,
    document: true,
    work: false,
  },
  // Started in November, invoiced in September: the invoice date wins.
  {
    title: 'invoiced-before',
    serviceDate: NOV,
    startDateTime: NOV,
    invoiceDate: SEP,
    document: false,
    work: true,
  },
  // Not invoiced yet: counts on its start.
  {
    title: 'uninvoiced-started-in',
    serviceDate: SEP,
    startDateTime: NOV,
    invoiceDate: null,
    document: true,
    work: true,
  },
  // A start outside the window is not overridden by a service date inside it.
  {
    title: 'uninvoiced-started-before',
    serviceDate: NOV,
    startDateTime: SEP,
    invoiceDate: null,
    document: false,
    work: false,
  },
  // Legacy: neither date, counts on its service date.
  {
    title: 'legacy-in',
    serviceDate: NOV,
    startDateTime: null,
    invoiceDate: null,
    document: true,
    work: true,
  },
  {
    title: 'legacy-before',
    serviceDate: OCT,
    startDateTime: null,
    invoiceDate: null,
    document: false,
    work: false,
  },
  // Invoiced in November with no start: in by document, out by work (service date in September).
  {
    title: 'invoiced-no-start',
    serviceDate: SEP,
    startDateTime: null,
    invoiceDate: NOV,
    document: true,
    work: false,
  },
  // The window's edges: the first instant is in, the end is not.
  {
    title: 'edge-start',
    serviceDate: SEP,
    startDateTime: SEP,
    invoiceDate: RANGE.gte,
    document: true,
    work: false,
  },
  {
    title: 'edge-end',
    serviceDate: SEP,
    startDateTime: RANGE.lt,
    invoiceDate: RANGE.lt,
    document: false,
    work: false,
  },
  // Marked paid by hand in November on a September invoice.
  {
    title: 'manual-marked-in',
    serviceDate: SEP,
    startDateTime: SEP,
    invoiceDate: SEP,
    manuallyPaid: true,
    manuallyPaidAt: NOV,
    document: false,
    work: false,
    manual: true,
  },
  // Marked in October on a November invoice: the day it was marked wins.
  {
    title: 'manual-marked-before',
    serviceDate: NOV,
    startDateTime: NOV,
    invoiceDate: NOV,
    manuallyPaid: true,
    manuallyPaidAt: OCT,
    document: true,
    work: true,
    manual: false,
  },
  // Marked before that day was recorded: falls back to the document date.
  {
    title: 'manual-unrecorded-in',
    serviceDate: SEP,
    startDateTime: SEP,
    invoiceDate: NOV,
    manuallyPaid: true,
    manuallyPaidAt: null,
    document: true,
    work: false,
    manual: true,
  },
  {
    title: 'manual-unrecorded-before',
    serviceDate: NOV,
    startDateTime: NOV,
    invoiceDate: SEP,
    manuallyPaid: true,
    manuallyPaidAt: null,
    document: false,
    work: true,
    manual: false,
  },
]

beforeAll(async () => {
  ;({ db } = await import('@/lib/db'))
  dates = await import('@/features/reports/Lib/reportDates')
  const organization = await db.organization.create({ data: { name: `Report dates ${stamp}` } })
  organizationId = organization.id
  for (const row of ROWS) {
    await db.serviceRecord.create({
      data: {
        organizationId,
        title: row.title,
        serviceDate: row.serviceDate,
        startDateTime: row.startDateTime,
        invoiceDate: row.invoiceDate,
        manuallyPaid: row.manuallyPaid ?? false,
        manuallyPaidAt: row.manuallyPaidAt ?? null,
      },
    })
  }
})

afterAll(async () => {
  // The jobs go with the workshop.
  if (organizationId) await db.organization.deleteMany({ where: { id: organizationId } })
})

async function titles(filter: ReturnType<typeof dates.documentDateIn>) {
  const rows = await db.serviceRecord.findMany({
    where: { organizationId, AND: [filter] },
    select: { title: true },
  })
  return rows.map((r) => r.title).sort()
}

const expected = (pick: (row: Row) => boolean | undefined) =>
  ROWS.filter((row) => pick(row))
    .map((row) => row.title)
    .sort()

describe('the report date filters on PostgreSQL', () => {
  it('finds the jobs whose document date is in the window', async () => {
    expect(await titles(dates.documentDateIn(RANGE))).toEqual(expected((r) => r.document))
  })

  it('finds the jobs whose work date is in the window', async () => {
    expect(await titles(dates.workDateIn(RANGE))).toEqual(expected((r) => r.work))
  })

  it('finds the jobs marked paid by hand in the window', async () => {
    expect(await titles(dates.manualPaidIn(RANGE))).toEqual(expected((r) => r.manual))
  })

  it('agrees with documentDateOf and workDateOf on every row', async () => {
    const rows = await db.serviceRecord.findMany({
      where: { organizationId },
      select: { title: true, serviceDate: true, startDateTime: true, invoiceDate: true },
    })
    const inRange = (d: Date) => d >= RANGE.gte && d < RANGE.lt
    for (const row of rows) {
      const want = ROWS.find((r) => r.title === row.title)!
      expect(inRange(dates.documentDateOf(row)), row.title).toBe(want.document)
      expect(inRange(dates.workDateOf(row)), row.title).toBe(want.work)
    }
  })
})
