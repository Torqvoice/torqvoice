/**
 * @vitest-environment node
 *
 * Nothing in a backup file may be, or point at, another workshop's row.
 * The file's ids are collected by model, foreign keys that point outside
 * the file are looked up in this workshop and otherwise cleared or take
 * their row with them, and an id that already belongs to another workshop
 * refuses the whole file.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  acquireRestoreLock,
  assertNoForeignRows,
  collectFileIds,
  danglingReferences,
  lookupOwnIds,
  mergeIds,
  ownershipWhere,
  releaseRestoreLock,
  RestoreRefusedError,
  restoreLockHolder,
  sanitiseForeignIds,
} from '@/lib/backup/tenancy'

const ORG = 'org-a'

/** A workshop file: a customer, a vehicle with a job and a part, a quote, an inspection. */
function file() {
  return {
    customers: [{ id: 'cust1', name: 'Kari' }],
    technicians: [{ id: 'tech1', name: 'Ola' }],
    workBays: [{ id: 'bay1', name: 'Bay 1' }],
    inspectionTemplates: [{ id: 'tmpl1', name: 'Default', sections: [] }],
    vehicles: [
      {
        id: 'veh1',
        customerId: 'cust1',
        serviceRecords: [
          {
            id: 'job1',
            vehicleId: 'veh1',
            customerId: 'cust1',
            technicianId: 'tech1',
            workBayId: 'bay1',
            partItems: [{ id: 'part1', serviceRecordId: 'job1', inventoryPartId: 'inv-gone' }],
            timeEntries: [{ id: 'time1', serviceRecordId: 'job1', technicianId: 'tech1' }],
          },
        ],
      },
    ],
    quotes: [{ id: 'quote1', vehicleId: 'veh1', customerId: 'cust1', inspectionId: 'insp-gone' }],
    inspections: [
      { id: 'insp1', vehicleId: 'veh1', templateId: 'tmpl1', items: [{ id: 'item1' }] },
    ],
  }
}

describe('collectFileIds', () => {
  it('lists every id in the file under the model it is bound for', () => {
    const ids = collectFileIds(file())
    expect([...ids.keys()].sort()).toEqual([
      'Customer',
      'Inspection',
      'InspectionItem',
      'InspectionTemplate',
      'Quote',
      'ServicePart',
      'ServiceRecord',
      'Technician',
      'TimeEntry',
      'Vehicle',
      'WorkBay',
    ])
    expect([...(ids.get('ServiceRecord') ?? [])]).toEqual(['job1'])
    expect([...(ids.get('ServicePart') ?? [])]).toEqual(['part1'])
  })
})

describe('danglingReferences', () => {
  it('names the foreign keys that point outside the file, by target model', () => {
    const data = file()
    const dangling = danglingReferences(data, collectFileIds(data))
    expect([...dangling.entries()].map(([m, s]) => [m, [...s]])).toEqual([
      ['InventoryPart', ['inv-gone']],
      ['Inspection', ['insp-gone']],
    ])
  })
})

describe('sanitiseForeignIds', () => {
  it('clears an optional link to a row the file does not carry, and keeps the rest', () => {
    const data = file()
    const result = sanitiseForeignIds(data, collectFileIds(data))
    expect(result).toEqual({ cleared: 2, dropped: 0 })
    expect(data.vehicles[0].serviceRecords[0].partItems[0].inventoryPartId).toBeNull()
    expect(data.quotes[0].inspectionId).toBeNull()
    // Links inside the file stay.
    expect(data.vehicles[0].customerId).toBe('cust1')
    expect(data.vehicles[0].serviceRecords[0].technicianId).toBe('tech1')
    expect(data.inspections[0].templateId).toBe('tmpl1')
  })

  it('keeps a link to a row this workshop already has', () => {
    const data = file()
    const own = new Map([['InventoryPart', new Set(['inv-gone'])]])
    sanitiseForeignIds(data, mergeIds(collectFileIds(data), own))
    expect(data.vehicles[0].serviceRecords[0].partItems[0].inventoryPartId).toBe('inv-gone')
    expect(data.quotes[0].inspectionId).toBeNull()
  })

  it('drops a row whose required link points outside the file, with what nests in it', () => {
    const data = file()
    // A crafted file: a job that claims someone else's vehicle, a time entry
    // for a technician the file does not carry, an inspection on a template
    // it does not carry, and a quote on someone else's vehicle.
    const job = data.vehicles[0].serviceRecords[0]
    ;(job as Record<string, unknown>).vehicleId = 'veh-of-org-b'
    job.timeEntries[0].technicianId = 'tech-of-org-b'
    data.inspections[0].templateId = 'tmpl-of-org-b'
    data.quotes[0].vehicleId = 'veh-of-org-b'

    const result = sanitiseForeignIds(data, collectFileIds(data))

    // Cleared: the job's and the quote's vehicle (optional links), the
    // quote's inspection and the part's inventory part (not in the file).
    // Dropped: the time entry and the inspection, whose links are required.
    expect(result).toEqual({ cleared: 4, dropped: 2 })
    expect(job.vehicleId).toBeNull()
    expect(job.timeEntries).toEqual([])
    expect(data.inspections).toEqual([])
    expect(data.quotes).toHaveLength(1)
    expect(data.quotes[0].vehicleId).toBeNull()
    expect(JSON.stringify(data)).not.toContain('org-b')
  })

  it('leaves columns that are not foreign keys, and links to people, alone', () => {
    const data = {
      smsMessages: [{ id: 'sms1', providerMsgId: 'SM-external', customerId: 'cust-gone' }],
      vehicles: [{ id: 'v1', userId: 'user-elsewhere' }],
    }
    sanitiseForeignIds(data, collectFileIds(data))
    expect(data.smsMessages[0].providerMsgId).toBe('SM-external')
    expect(data.smsMessages[0].customerId).toBeNull()
    expect(data.vehicles[0].userId).toBe('user-elsewhere')
  })
})

describe('ownershipWhere', () => {
  it('uses the model column, or the parent chain for a child model', () => {
    expect(ownershipWhere('Customer', ORG)).toEqual({ organizationId: ORG })
    expect(ownershipWhere('ServicePart', ORG)).toEqual({ serviceRecord: { organizationId: ORG } })
    expect(ownershipWhere('InspectionTemplateItem', ORG)).toEqual({
      section: { template: { organizationId: ORG } },
    })
    // Two possible parents: either makes it ours.
    expect(ownershipWhere('StoredImage', ORG)).toEqual({
      OR: [
        { inventoryPart: { organizationId: ORG } },
        { tireMeasurement: { tireSet: { organizationId: ORG } } },
        { tireMeasurement: { movement: { organizationId: ORG } } },
      ],
    })
    expect(ownershipWhere('NoSuchModel', ORG)).toBeNull()
  })
})

/** A client whose findMany answers from a table of rows with an owner. */
function fakeTx(rows: Record<string, { id: string; owner: string }[]>) {
  const calls: { model: string; where: unknown }[] = []
  const tx = new Proxy(
    {},
    {
      get: (_t, model: string) => ({
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          calls.push({ model, where })
          const ids = (where.id as { in: string[] }).in
          const wantOurs = !('NOT' in where)
          return (rows[model] ?? [])
            .filter((r) => ids.includes(r.id))
            .filter((r) => (r.owner === ORG) === wantOurs)
            .map((r) => ({ id: r.id }))
        },
      }),
    }
  )
  return { tx, calls }
}

describe('assertNoForeignRows', () => {
  it("passes when the ids are new or this workshop's own", async () => {
    const { tx, calls } = fakeTx({ customer: [{ id: 'cust1', owner: ORG }] })
    await expect(assertNoForeignRows(tx, ORG, collectFileIds(file()))).resolves.toBeUndefined()
    const customers = calls.find((c) => c.model === 'customer')
    expect(customers?.where).toEqual({
      id: { in: ['cust1'] },
      NOT: { organizationId: ORG },
    })
    // Child models are asked through their parent.
    expect(calls.find((c) => c.model === 'servicePart')?.where).toEqual({
      id: { in: ['part1'] },
      NOT: { serviceRecord: { organizationId: ORG } },
    })
  })

  it("refuses the file when an id is another workshop's row", async () => {
    const { tx } = fakeTx({ vehicle: [{ id: 'veh1', owner: 'org-b' }] })
    const error = await assertNoForeignRows(tx, ORG, collectFileIds(file())).catch((e) => e)
    expect(error).toBeInstanceOf(RestoreRefusedError)
    expect(error.code).toBe('foreign_ids')
    expect(error.message).toMatch(/1 Vehicle id/)
  })

  it('refuses a child row of another workshop too', async () => {
    const { tx } = fakeTx({ servicePart: [{ id: 'part1', owner: 'org-b' }] })
    await expect(assertNoForeignRows(tx, ORG, collectFileIds(file()))).rejects.toThrow(
      /ServicePart/
    )
  })
})

describe('lookupOwnIds', () => {
  it('returns the candidates that are rows of this workshop', async () => {
    const { tx, calls } = fakeTx({
      inventoryPart: [
        { id: 'inv-gone', owner: ORG },
        { id: 'inv-theirs', owner: 'org-b' },
      ],
    })
    const own = await lookupOwnIds(
      tx,
      ORG,
      new Map([['InventoryPart', new Set(['inv-gone', 'inv-theirs', 'inv-none'])]])
    )
    expect([...(own.get('InventoryPart') ?? [])]).toEqual(['inv-gone'])
    expect(calls[0].where).toEqual({
      id: { in: ['inv-gone', 'inv-theirs', 'inv-none'] },
      organizationId: ORG,
    })
  })
})

describe('the restore lock', () => {
  it('admits one holder at a time and only the holder releases it', () => {
    releaseRestoreLock(restoreLockHolder() ?? '')
    expect(acquireRestoreLock('one')).toBe(true)
    expect(acquireRestoreLock('two')).toBe(false)
    releaseRestoreLock('two')
    expect(restoreLockHolder()).toBe('one')
    releaseRestoreLock('one')
    expect(restoreLockHolder()).toBeNull()
  })
})
