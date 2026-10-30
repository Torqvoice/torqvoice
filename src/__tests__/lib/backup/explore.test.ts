// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Looking inside a restore point without restoring it. The engine and
 * restic are mocked: `resticFind` returns the paths a test chooses and
 * `resticDumpToFile` writes a real file the test chooses to the target the
 * explorer asks for. What is checked is which file is pulled out, how it is
 * read into lists, what is searched and paged, which upload a file request
 * may reach, and when an open restore point (and its folder) goes away.
 */

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  root: '',
  /** Organisation id `openTarget` reports for a destination target. */
  orgId: 'org1',
  /** What `resticFind` answers, by pattern. */
  found: {} as Record<string, string[]>,
  /** What `resticDumpToFile` writes, by snapshot path. */
  files: {} as Record<string, string>,
  finds: [] as { snapshotId: string; pattern: string }[],
  dumps: [] as { snapshotId: string; path: string; target: string }[],
}))

vi.mock('@/lib/upload-root', () => ({ dataRoot: () => h.root }))

vi.mock('@/lib/backup/engine', () => ({
  openTarget: vi.fn(async (target: Row) => ({
    kind: target.kind,
    organizationId: target.kind === 'platform' ? target.organizationId : h.orgId,
    connectionId: target.kind === 'destination' ? target.connectionId : null,
    base: { repository: { repository: '/repo' }, password: 'pw', cacheDir: '/cache' },
  })),
}))

vi.mock('@/lib/backup/restic', () => ({
  resticFind: vi.fn(async (_opts: unknown, input: { snapshotId: string; pattern: string }) => {
    h.finds.push(input)
    return (h.found[input.pattern] ?? []).map((p) => ({ path: p, size: null, mtime: null }))
  }),
  resticDumpToFile: vi.fn(
    async (_opts: unknown, input: { snapshotId: string; path: string; target: string }) => {
      h.dumps.push(input)
      const body = h.files[input.path]
      if (body === undefined) throw new Error(`no such file in the fake snapshot: ${input.path}`)
      mkdirSync(path.dirname(input.target), { recursive: true })
      writeFileSync(input.target, body)
      return { bytes: Buffer.byteLength(body) }
    }
  ),
}))

import { openTarget } from '@/lib/backup/engine'
import {
  closeRestorePoints,
  exploreDirFor,
  extractRestorePointFile,
  getRestorePointRow,
  listRestorePointRows,
  openRestorePoint,
  RestorePointClosedError,
} from '@/lib/backup/explore'
import type { RunTarget } from '@/lib/backup/engine'

h.root = mkdtempSync(path.join(tmpdir(), 'backup-explore-test-'))
afterAll(() => rmSync(h.root, { recursive: true, force: true }))

const ORG = 'org1'
const SNAP = '28891c8f448a3c36'
const SNAP2 = '9d6cb16e448a3c36'
const TARGET: RunTarget = { kind: 'platform', organizationId: ORG }
const STAGED = '/tmp/torqvoice-backup-staging/org1/data.json'
const STAGED_OLD = '/tmp/torqvoice-backup-staging/cmoldinstall1/data.json'
const UPLOADED = '/data/uploads/org1/services/data.json'

const DATA = {
  version: 2,
  exportedAt: '2026-10-01T02:00:00.000Z',
  data: {
    customers: [
      {
        id: 'c1',
        organizationId: ORG,
        userId: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        phone: '+47 911 22 333',
        customerNumber: 'C-1001',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        organizationId: ORG,
        userId: 'u1',
        name: 'Bob Builder',
        company: 'Bobs Garage',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    vehicles: [
      {
        id: 'v1',
        organizationId: ORG,
        licensePlate: 'AB12345',
        year: 2019,
        make: 'Volvo',
        model: 'V70',
        vin: 'YV1SW58D123456789',
        customerId: 'c1',
        createdAt: '2026-02-01T00:00:00.000Z',
        serviceRecords: [
          {
            id: 'sr1',
            organizationId: ORG,
            invoiceNumber: 'INV-7',
            title: 'Oil change',
            status: 'completed',
            serviceDate: '2026-04-01T10:00:00.000Z',
            partItems: [{ id: 'pi1', name: 'Filter' }],
          },
          {
            id: 'sr2',
            invoiceNumber: 'INV-5',
            title: 'Brake pads',
            status: 'open',
            serviceDate: '2026-03-15T10:00:00.000Z',
          },
        ],
      },
      {
        id: 'v2',
        licensePlate: 'CD99887',
        make: 'Tesla',
        model: 'Model 3',
        createdAt: '2026-02-10T00:00:00.000Z',
      },
    ],
    counterSales: [
      { id: 'cs1', invoiceNumber: 'INV-9', title: 'Wipers', createdAt: '2026-05-01T00:00:00.000Z' },
    ],
    quotes: [
      {
        id: 'q1',
        quoteNumber: 'Q-3',
        title: 'Timing belt',
        customerId: 'c2',
        status: 'draft',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    inventoryParts: [
      {
        id: 'p1',
        name: 'Oil filter',
        partNumber: 'OF-123',
        sku: 'SKU-9',
        createdAt: '2026-01-05T00:00:00.000Z',
      },
    ],
    // Not shown by the explorer, and must not upset it.
    settings: [{ id: 's1', key: 'workshop.name', value: 'Garage' }],
  },
}

function stage(data: unknown = DATA, staged: string[] = [STAGED]): void {
  h.found['data.json'] = staged
  for (const p of staged) h.files[p] = JSON.stringify(data)
}

function ids(items: { id: string }[]): string[] {
  return items.map((i) => i.id)
}

beforeEach(() => {
  delete (globalThis as { __torqvoiceExplore?: unknown }).__torqvoiceExplore
  rmSync(path.join(h.root, 'restore-explore'), { recursive: true, force: true })
  h.orgId = ORG
  h.found = {}
  h.files = {}
  h.finds = []
  h.dumps = []
  vi.mocked(openTarget).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('openRestorePoint', () => {
  it('pulls the staged data file into the restore point folder and counts what it holds', async () => {
    stage()
    const summary = await openRestorePoint(TARGET, SNAP)

    expect(summary).toEqual({
      snapshotId: SNAP,
      exportedAt: '2026-10-01T02:00:00.000Z',
      counts: {
        customers: 2,
        vehicles: 2,
        // Two lifted out of their vehicle, one counter sale.
        serviceRecords: 3,
        quotes: 1,
        inventoryParts: 1,
      },
    })
    expect(h.finds).toEqual([{ snapshotId: SNAP, pattern: 'data.json' }])
    expect(h.dumps).toHaveLength(1)
    expect(h.dumps[0].path).toBe(STAGED)
    expect(h.dumps[0].snapshotId).toBe(SNAP)
    expect(h.dumps[0].target).toBe(path.join(exploreDirFor(ORG, SNAP), 'data.json'))
    expect(h.dumps[0].target.startsWith(path.join(h.root, 'restore-explore', ORG, SNAP))).toBe(true)
    expect(existsSync(h.dumps[0].target)).toBe(true)
  })

  it('returns exportedAt as null when the file has none', async () => {
    stage({ version: 2, data: { customers: [{ id: 'c1', name: 'A' }] } })
    const summary = await openRestorePoint(TARGET, SNAP)
    expect(summary.exportedAt).toBeNull()
    expect(summary.counts).toEqual({
      customers: 1,
      vehicles: 0,
      serviceRecords: 0,
      quotes: 0,
      inventoryParts: 0,
    })
  })

  it('does not pull the data file again while the restore point is open', async () => {
    stage()
    await openRestorePoint(TARGET, SNAP)
    const again = await openRestorePoint(TARGET, SNAP)
    expect(again.counts.customers).toBe(2)
    expect(h.dumps).toHaveLength(1)
  })

  it('prefers the data file under the workshop’s own id when another id is there too', async () => {
    stage(DATA, [STAGED_OLD, STAGED])
    h.files[STAGED_OLD] = JSON.stringify({ version: 2, data: { customers: [] } })
    const summary = await openRestorePoint(TARGET, SNAP)
    expect(h.dumps.map((d) => d.path)).toEqual([STAGED])
    expect(summary.counts.customers).toBe(2)
  })

  it('falls back to the other id’s data file when only that one is there', async () => {
    stage(DATA, [STAGED_OLD])
    const summary = await openRestorePoint(TARGET, SNAP)
    expect(h.dumps.map((d) => d.path)).toEqual([STAGED_OLD])
    expect(summary.counts.customers).toBe(2)
  })

  it('ignores a data.json in the uploads folder', async () => {
    stage(DATA, [UPLOADED, STAGED])
    await openRestorePoint(TARGET, SNAP)
    expect(h.dumps.map((d) => d.path)).toEqual([STAGED])
  })

  it('fails when the only data.json is an upload', async () => {
    stage(DATA, [UPLOADED, '/srv/data.json', '/torqvoice-backup-staging/data.json'])
    await expect(openRestorePoint(TARGET, SNAP)).rejects.toThrow(
      'This restore point holds no data file'
    )
    expect(h.dumps).toEqual([])
  })

  it('rejects a snapshot id that is not a restic id before opening anything', async () => {
    for (const bad of ['abc1234', 'ABCDEF12', '../../etc', `${'a'.repeat(65)}`, 'abcdefg1', '']) {
      await expect(openRestorePoint(TARGET, bad)).rejects.toThrow('Invalid snapshot id')
    }
    expect(openTarget).not.toHaveBeenCalled()
    expect(h.finds).toEqual([])
  })

  it('rejects a data file that is not a backup and removes its folder', async () => {
    stage({ hello: 'world' })
    await expect(openRestorePoint(TARGET, SNAP)).rejects.toThrow('could not be read')
    expect(existsSync(exploreDirFor(ORG, SNAP))).toBe(false)
    expect(() => listRestorePointRows(ORG, SNAP, 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )

    stage({ version: '2', data: {} })
    await expect(openRestorePoint(TARGET, SNAP)).rejects.toThrow('could not be read')
    stage({ version: 2, data: [] })
    await expect(openRestorePoint(TARGET, SNAP)).rejects.toThrow('could not be read')
    expect(existsSync(exploreDirFor(ORG, SNAP))).toBe(false)
  })

  it('takes the organisation from the opened target', async () => {
    stage(DATA, ['/tmp/torqvoice-backup-staging/org7/data.json'])
    h.orgId = 'org7'
    await openRestorePoint({ kind: 'destination', connectionId: 'conn1' }, SNAP)
    expect(listRestorePointRows('org7', SNAP, 'customers', '', 1).total).toBe(2)
    expect(() => listRestorePointRows(ORG, SNAP, 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )
  })
})

describe('listRestorePointRows', () => {
  beforeEach(async () => {
    stage()
    await openRestorePoint(TARGET, SNAP)
  })

  it('lists each dataset newest first, with a title and a line under it', () => {
    const customers = listRestorePointRows(ORG, SNAP, 'customers', '', 1)
    expect(customers).toMatchObject({ total: 2, page: 1, pages: 1 })
    expect(customers.items).toEqual([
      { id: 'c2', title: 'Bob Builder', subtitle: 'Bobs Garage', at: '2026-03-01T00:00:00.000Z' },
      {
        id: 'c1',
        title: 'Ada Lovelace',
        subtitle: '#C-1001 · ada@example.test · +47 911 22 333',
        at: '2026-01-01T00:00:00.000Z',
      },
    ])

    const vehicles = listRestorePointRows(ORG, SNAP, 'vehicles', '', 1)
    expect(vehicles.items).toEqual([
      { id: 'v2', title: 'CD99887 · Tesla Model 3', subtitle: '', at: '2026-02-10T00:00:00.000Z' },
      {
        id: 'v1',
        title: 'AB12345 · 2019 Volvo V70',
        subtitle: 'Ada Lovelace',
        at: '2026-02-01T00:00:00.000Z',
      },
    ])

    const work = listRestorePointRows(ORG, SNAP, 'serviceRecords', '', 1)
    expect(ids(work.items)).toEqual(['cs1', 'sr1', 'sr2'])
    expect(work.items[1]).toEqual({
      id: 'sr1',
      title: '#INV-7 Oil change',
      subtitle: 'AB12345 · 2019 Volvo V70 · completed · 2026-04-01',
      at: '2026-04-01T10:00:00.000Z',
    })
    expect(work.items[0]).toMatchObject({ title: '#INV-9 Wipers', subtitle: '' })

    expect(listRestorePointRows(ORG, SNAP, 'quotes', '', 1).items).toEqual([
      {
        id: 'q1',
        title: '#Q-3 Timing belt',
        subtitle: 'Bob Builder · draft',
        at: '2026-06-01T00:00:00.000Z',
      },
    ])
    expect(listRestorePointRows(ORG, SNAP, 'inventoryParts', '', 1).items).toEqual([
      { id: 'p1', title: 'Oil filter', subtitle: 'OF-123 · SKU-9', at: '2026-01-05T00:00:00.000Z' },
    ])
  })

  it('searches titles and lines, ignoring case', () => {
    expect(ids(listRestorePointRows(ORG, SNAP, 'customers', 'lovelace', 1).items)).toEqual(['c1'])
    expect(ids(listRestorePointRows(ORG, SNAP, 'customers', 'BOBS', 1).items)).toEqual(['c2'])
    expect(ids(listRestorePointRows(ORG, SNAP, 'serviceRecords', 'brake', 1).items)).toEqual([
      'sr2',
    ])
    // The vehicle label in a work order's line.
    expect(ids(listRestorePointRows(ORG, SNAP, 'serviceRecords', 'volvo', 1).items)).toEqual([
      'sr1',
      'sr2',
    ])
    expect(ids(listRestorePointRows(ORG, SNAP, 'quotes', 'bob builder', 1).items)).toEqual(['q1'])
  })

  it('searches plate, VIN, email, phone, part number, invoice and customer number', () => {
    const one = (dataset: Parameters<typeof listRestorePointRows>[2], q: string) =>
      ids(listRestorePointRows(ORG, SNAP, dataset, q, 1).items)
    expect(one('vehicles', 'ab123')).toEqual(['v1'])
    // Not in the title or the line (the line is the owner): the VIN field.
    expect(one('vehicles', 'yv1sw58d')).toEqual(['v1'])
    expect(one('customers', 'ADA@EXAMPLE')).toEqual(['c1'])
    expect(one('customers', '911 22')).toEqual(['c1'])
    expect(one('customers', 'c-1001')).toEqual(['c1'])
    expect(one('inventoryParts', 'of-123')).toEqual(['p1'])
    expect(one('inventoryParts', 'sku-9')).toEqual(['p1'])
    expect(one('serviceRecords', 'inv-9')).toEqual(['cs1'])
    expect(one('quotes', 'q-3')).toEqual(['q1'])
    expect(one('customers', 'nobody')).toEqual([])
  })

  it('trims the query and treats a blank one as no filter', () => {
    expect(listRestorePointRows(ORG, SNAP, 'customers', '   ', 1).total).toBe(2)
    expect(ids(listRestorePointRows(ORG, SNAP, 'customers', '  ada  ', 1).items)).toEqual(['c1'])
  })

  it('pages by 50 and clamps the page', async () => {
    const parts = Array.from({ length: 120 }, (_, i) => ({
      id: `p${i}`,
      name: `Part ${i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    }))
    stage({ version: 2, data: { inventoryParts: parts } })
    await openRestorePoint(TARGET, SNAP2)

    const first = listRestorePointRows(ORG, SNAP2, 'inventoryParts', '', 1)
    expect(first).toMatchObject({ total: 120, page: 1, pages: 3 })
    expect(first.items).toHaveLength(50)
    expect(first.items[0].id).toBe('p119')

    const last = listRestorePointRows(ORG, SNAP2, 'inventoryParts', '', 3)
    expect(last.items).toHaveLength(20)
    expect(last.items.at(-1)?.id).toBe('p0')

    expect(listRestorePointRows(ORG, SNAP2, 'inventoryParts', '', 99)).toMatchObject({
      page: 3,
      pages: 3,
    })
    expect(listRestorePointRows(ORG, SNAP2, 'inventoryParts', '', 0).page).toBe(1)
    expect(listRestorePointRows(ORG, SNAP2, 'inventoryParts', '', -5).page).toBe(1)

    // Nothing found is one empty page, not page zero.
    expect(listRestorePointRows(ORG, SNAP2, 'inventoryParts', 'zzz', 4)).toEqual({
      items: [],
      total: 0,
      page: 1,
      pages: 1,
    })
  })

  it('refuses a restore point that was never opened, or another organisation’s', () => {
    expect(() => listRestorePointRows(ORG, SNAP2, 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )
    expect(() => listRestorePointRows('org2', SNAP, 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )
    try {
      listRestorePointRows('org2', SNAP, 'customers', '', 1)
    } catch (err) {
      expect((err as Error).message).toBe('restorePointClosed')
      expect((err as Error).name).toBe('RestorePointClosedError')
    }
  })
})

describe('getRestorePointRow', () => {
  beforeEach(async () => {
    stage()
    await openRestorePoint(TARGET, SNAP)
  })

  it('returns the row as the file has it, without the bookkeeping keys', () => {
    const customer = getRestorePointRow(ORG, SNAP, 'customers', 'c1')
    expect(customer?.item.title).toBe('Ada Lovelace')
    expect(customer?.row).not.toHaveProperty('organizationId')
    expect(customer?.row).not.toHaveProperty('userId')
    expect(customer?.row).toMatchObject({ id: 'c1', email: 'ada@example.test' })

    const work = getRestorePointRow(ORG, SNAP, 'serviceRecords', 'sr1')
    expect(work?.row).not.toHaveProperty('_vehicle')
    expect(work?.row).not.toHaveProperty('organizationId')
    expect(work?.row).toMatchObject({
      id: 'sr1',
      vehicleId: 'v1',
      partItems: [{ id: 'pi1', name: 'Filter' }],
    })
    // The label still makes the line under the title.
    expect(work?.item.subtitle).toContain('AB12345')

    expect(getRestorePointRow(ORG, SNAP, 'serviceRecords', 'cs1')?.row).toMatchObject({
      id: 'cs1',
      vehicleId: null,
    })
  })

  it('returns null for an id that is not there', () => {
    expect(getRestorePointRow(ORG, SNAP, 'customers', 'nope')).toBeNull()
    // An id from another dataset is not found in this one.
    expect(getRestorePointRow(ORG, SNAP, 'customers', 'v1')).toBeNull()
  })

  it('refuses another organisation', () => {
    expect(() => getRestorePointRow('org2', SNAP, 'customers', 'c1')).toThrow(
      RestorePointClosedError
    )
  })
})

describe('extractRestorePointFile', () => {
  const OWN = '/srv/torqvoice/data/uploads/org1/services/photo.jpg'
  const OTHER_ORG = '/srv/torqvoice/data/uploads/org2/services/photo.jpg'

  beforeEach(async () => {
    stage()
    await openRestorePoint(TARGET, SNAP)
    h.finds = []
    h.dumps = []
  })

  it('needs the restore point open', async () => {
    await expect(extractRestorePointFile(ORG, SNAP2, 'services', 'photo.jpg')).rejects.toThrow(
      RestorePointClosedError
    )
    await expect(extractRestorePointFile('org2', SNAP, 'services', 'photo.jpg')).rejects.toThrow(
      RestorePointClosedError
    )
  })

  it('refuses a category it does not know', async () => {
    for (const category of ['secrets', '..', 'services/..', '']) {
      await expect(extractRestorePointFile(ORG, SNAP, category, 'photo.jpg')).rejects.toThrow(
        'Unknown file category'
      )
    }
    expect(h.finds).toEqual([])
  })

  it('refuses a name with a slash or two dots', async () => {
    for (const name of [
      'a/b.jpg',
      '../photo.jpg',
      '..',
      'photo..jpg',
      '.hidden',
      'a\\b.jpg',
      '',
      'x'.repeat(202),
    ]) {
      await expect(extractRestorePointFile(ORG, SNAP, 'services', name)).rejects.toThrow(
        'Invalid file name'
      )
    }
    expect(h.finds).toEqual([])
  })

  it('pulls the file only from this workshop’s uploads folder, in that category', async () => {
    h.found['photo.jpg'] = [
      OTHER_ORG,
      '/srv/torqvoice/data/uploads/org1/vehicles/photo.jpg',
      '/srv/torqvoice/data/elsewhere/org1/services/photo.jpg',
      OWN,
    ]
    h.files[OWN] = 'jpeg bytes'
    h.files[OTHER_ORG] = 'not ours'

    const out = await extractRestorePointFile(ORG, SNAP, 'services', 'photo.jpg')
    expect(h.finds).toEqual([{ snapshotId: SNAP, pattern: 'photo.jpg' }])
    expect(h.dumps.map((d) => d.path)).toEqual([OWN])
    expect(out.file).toBe(path.join(exploreDirFor(ORG, SNAP), 'files', 'services', 'photo.jpg'))
    expect(out.bytes).toBe(10)
    expect(readFileSync(out.file, 'utf8')).toBe('jpeg bytes')
  })

  it('does not return a same-named file from another organisation’s uploads folder', async () => {
    h.found['photo.jpg'] = [OTHER_ORG, '/srv/torqvoice/data/uploads/org1/vehicles/photo.jpg']
    h.files[OTHER_ORG] = 'not ours'
    await expect(extractRestorePointFile(ORG, SNAP, 'services', 'photo.jpg')).rejects.toThrow(
      'That file is not in this restore point'
    )
    expect(h.dumps).toEqual([])
  })

  it('keeps the file it pulled out, so a second request does not ask restic again', async () => {
    h.found['photo.jpg'] = [OWN]
    h.files[OWN] = 'jpeg bytes'
    const first = await extractRestorePointFile(ORG, SNAP, 'services', 'photo.jpg')
    const second = await extractRestorePointFile(ORG, SNAP, 'services', 'photo.jpg')
    expect(second).toEqual(first)
    expect(h.finds).toHaveLength(1)
    expect(h.dumps).toHaveLength(1)
  })

  it('opens the restore point’s own target to look', async () => {
    vi.mocked(openTarget).mockClear()
    h.found['photo.jpg'] = [OWN]
    h.files[OWN] = 'jpeg bytes'
    await extractRestorePointFile(ORG, SNAP, 'services', 'photo.jpg')
    expect(openTarget).toHaveBeenCalledWith(TARGET)
  })
})

describe('closing restore points', () => {
  const MIN = 60 * 1000

  it('closeRestorePoints removes the workshop’s open points and their folders', async () => {
    stage()
    await openRestorePoint(TARGET, SNAP)
    stage(DATA, ['/tmp/torqvoice-backup-staging/org2/data.json'])
    await openRestorePoint({ kind: 'platform', organizationId: 'org2' }, SNAP)
    const dir = exploreDirFor(ORG, SNAP)
    expect(existsSync(dir)).toBe(true)

    await closeRestorePoints(ORG)

    expect(existsSync(dir)).toBe(false)
    expect(() => listRestorePointRows(ORG, SNAP, 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )
    // Another workshop's stays open.
    expect(listRestorePointRows('org2', SNAP, 'customers', '', 1).total).toBe(2)
    expect(existsSync(exploreDirFor('org2', SNAP))).toBe(true)
  })

  it('closes a point open longer than 15 minutes on the next open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T10:00:00Z'))
    stage()
    await openRestorePoint(TARGET, SNAP)
    const dir = exploreDirFor(ORG, SNAP)

    vi.setSystemTime(new Date(Date.parse('2026-10-30T10:00:00Z') + 15 * MIN + 1))
    expect(() => listRestorePointRows(ORG, SNAP, 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )
    expect(existsSync(dir)).toBe(true)

    await openRestorePoint(TARGET, SNAP2)
    expect(existsSync(dir)).toBe(false)
    expect(existsSync(exploreDirFor(ORG, SNAP2))).toBe(true)
  })

  it('keeps a point open while it is being looked at', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.parse('2026-10-30T10:00:00Z')
    vi.setSystemTime(new Date(start))
    stage()
    await openRestorePoint(TARGET, SNAP)

    vi.setSystemTime(new Date(start + 10 * MIN))
    listRestorePointRows(ORG, SNAP, 'customers', '', 1)
    vi.setSystemTime(new Date(start + 20 * MIN))
    await openRestorePoint(TARGET, SNAP2)
    expect(listRestorePointRows(ORG, SNAP, 'customers', '', 1).total).toBe(2)
    expect(existsSync(exploreDirFor(ORG, SNAP))).toBe(true)
  })

  it('keeps at most four open, closing the oldest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.parse('2026-10-30T10:00:00Z')
    const snaps = ['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3', 'aaaaaaa4', 'aaaaaaa5']
    stage()
    for (const [i, snap] of snaps.entries()) {
      vi.setSystemTime(new Date(start + i * 1000))
      await openRestorePoint(TARGET, snap)
    }

    expect(() => listRestorePointRows(ORG, snaps[0], 'customers', '', 1)).toThrow(
      RestorePointClosedError
    )
    expect(existsSync(exploreDirFor(ORG, snaps[0]))).toBe(false)
    for (const snap of snaps.slice(1)) {
      expect(listRestorePointRows(ORG, snap, 'customers', '', 1).total).toBe(2)
      expect(existsSync(exploreDirFor(ORG, snap))).toBe(true)
    }
  })
})
