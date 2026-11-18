/**
 * A new job's number follows the format the workshop chose under Settings,
 * Invoice, Numbering, and is never one already in use.
 *
 * It used to continue from the newest job alone. When that job had no number
 * (an online booking) the sequence restarted at 1001, and when it was numbered
 * in another format (XT-1018 after an import) the next job got 2026-1019,
 * which the workshop had issued long before.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: vi.fn(),
    serviceRecord: { findFirst: vi.fn() },
    appSetting: { updateMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { jobNumberPattern, jobNumberPrefix, nextJobNumber } from '@/lib/job-number'

const ORG = 'org-1'
const OSLO = 'Europe/Oslo'
/** 13 November 2026 in Oslo. */
const NOW = new Date('2026-11-13T09:00:00Z')

/** The highest running number already issued in the workshop's format, as PostgreSQL returns it. */
function highestInFormat(n: number | string | null) {
  vi.mocked(db.$queryRaw).mockResolvedValue([{ highest: n === null ? null : String(n) }] as never)
}
function newestNumbered(invoiceNumber: string | null) {
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(
    invoiceNumber === null ? null : ({ invoiceNumber } as never)
  )
}
function numbered(settings: Record<string, string> = {}, now = NOW) {
  return nextJobNumber({
    organizationId: ORG,
    settings: { 'workshop.invoicePrefix': '{year}-', ...settings },
    timeZone: OSLO,
    now,
  })
}
async function next(settings: Record<string, string> = {}, now = NOW) {
  return (await numbered(settings, now)).invoiceNumber
}

beforeEach(() => {
  vi.clearAllMocks()
  highestInFormat(null)
  newestNumbered(null)
})

describe('the next job number', () => {
  it('continues from the highest number in the format, not from the newest job', async () => {
    // The newest job is XT-1018 or an online booking with no number; 2026-1071 exists.
    highestInFormat(1071)
    newestNumbered('XT-1018')

    expect(await next()).toBe('2026-1072')
    expect(db.serviceRecord.findFirst).not.toHaveBeenCalled()
  })

  it('asks only for numbers in the workshop format, in its own workshop', async () => {
    highestInFormat(1071)
    await next({ 'workshop.invoicePrefix': 'WO-{year}/' })

    const [sql, ...values] = vi.mocked(db.$queryRaw).mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    expect(sql.join('?')).toContain('"organizationId" = ?')
    expect(values).toContain(ORG)
    expect(values).toContain(jobNumberPattern('WO-{year}/'))
  })

  it('carries the running number across a new year', async () => {
    highestInFormat(1050)

    expect(await next({}, new Date('2027-01-04T09:00:00Z'))).toBe('2027-1051')
  })

  it("writes the year on the workshop's calendar, not the server's", async () => {
    highestInFormat(1050)
    // 00:30 on 1 January in Oslo is still 31 December in UTC.
    expect(await next({}, new Date('2026-12-31T23:30:00Z'))).toBe('2027-1051')
  })

  it('writes the month when the format asks for it', async () => {
    highestInFormat(7)

    expect(await next({ 'workshop.invoicePrefix': 'INV-{year}{month}-' })).toBe('INV-202611-8')
  })

  it('continues from the newest numbered job after the format has changed', async () => {
    newestNumbered('2026-1071')

    expect(await next({ 'workshop.invoicePrefix': 'WO-' })).toBe('WO-1072')
    expect(db.serviceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, invoiceNumber: { not: null } } })
    )
  })

  it('starts at 1001 in a workshop with no numbers yet', async () => {
    expect(await next()).toBe('2026-1001')
  })

  it('uses "Next invoice number", and leaves clearing it to whoever writes the job', async () => {
    highestInFormat(1071)

    expect(await numbered({ 'workshop.invoiceStartNumber': '2000' })).toEqual({
      invoiceNumber: '2026-2000',
      usesNextNumberSetting: true,
    })
    // Cleared here, a job that then failed to save would lose it.
    expect(db.appSetting.updateMany).not.toHaveBeenCalled()
  })

  it('keeps counting from a "Next invoice number" below 1001 once it has been used', async () => {
    // The settings page suggests 94; the job after 2026-94 is 2026-95, not 2026-1001.
    highestInFormat(94)

    expect(await next()).toBe('2026-95')
  })

  it('never goes back to a "Next invoice number" already passed', async () => {
    highestInFormat(1071)

    expect(await numbered({ 'workshop.invoiceStartNumber': '96' })).toEqual({
      invoiceNumber: '2026-1072',
      usesNextNumberSetting: false,
    })
  })

  it('counts past numbers of any length, so a long one is read back and never issued twice', async () => {
    highestInFormat('999999999999999')
    expect(await next()).toBe('2026-1000000000000000')

    highestInFormat('99999999999999999999')
    expect(await next()).toBe('2026-100000000000000000000')
  })

  it('reads a long running number off the newest job whole', async () => {
    newestNumbered('XT-12345678901234567890')

    expect(await next({ 'workshop.invoicePrefix': 'WO-' })).toBe('WO-12345678901234567891')
  })

  it('reads "{year}-" as the format when the workshop never set one', async () => {
    highestInFormat(1071)

    const number = await nextJobNumber({
      organizationId: ORG,
      settings: {},
      timeZone: OSLO,
      now: NOW,
    })

    expect(number.invoiceNumber).toBe('2026-1072')
  })
})

describe('which numbers count as the same format', () => {
  const matches = (format: string, number: string) =>
    new RegExp(jobNumberPattern(format)).exec(number)?.[1] ?? null

  it('any length of running number', () => {
    expect(matches('{year}-', '2026-100000000000000000000')).toBe('100000000000000000000')
  })

  it('any year, the same shape', () => {
    expect(matches('{year}-', '2026-1071')).toBe('1071')
    expect(matches('{year}-', '2019-5')).toBe('5')
    expect(matches('{year}-', 'XT-1018')).toBeNull()
    expect(matches('{year}-', '26-1018')).toBeNull()
  })

  it('reads the format literally around the year and month', () => {
    expect(matches('INV/{year}.{month}-', 'INV/2026.11-12')).toBe('12')
    expect(matches('INV/{year}.{month}-', 'INV/2026x11-12')).toBeNull()
    expect(matches('', '1043')).toBe('1043')
    expect(matches('', '2026-1043')).toBeNull()
  })

  it('writes the year and month of the day it is in the workshop', () => {
    expect(jobNumberPrefix('{year}/{month}/', NOW, OSLO)).toBe('2026/11/')
  })
})
