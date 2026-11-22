/**
 * @vitest-environment node
 *
 * Where a row of the dashboard's Recent Activity leads.
 *
 * Someone who sees "changed a work order" wants to open that work order. A
 * row may only link to a record that still exists in this workshop: the id in
 * an audit row outlives the record it names, and it may never be trusted to
 * belong here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tables = vi.hoisted(() => {
  const table = () => ({ findMany: vi.fn(async (_args: unknown): Promise<unknown[]> => []) })
  return {
    serviceRecord: table(),
    vehicle: table(),
    quote: table(),
    customer: table(),
    inspection: table(),
    inventoryPart: table(),
  }
})
vi.mock('@/lib/db', () => ({ db: tables }))

import { activityLinks } from '@/features/audit/Lib/activityLinks'

const row = (id: string, entity: string | null, entityId: string | null) => ({
  id,
  entity,
  entityId,
})

beforeEach(() => {
  for (const table of Object.values(tables)) {
    table.findMany.mockReset()
    table.findMany.mockResolvedValue([])
  }
})

describe('the links of the recent activity list', () => {
  it('opens a work order on its vehicle, and a counter sale on its own page', async () => {
    tables.serviceRecord.findMany.mockResolvedValue([
      { id: 'job-1', vehicleId: 'veh-1' },
      { id: 'sale-1', vehicleId: null },
    ])

    const links = await activityLinks('org-1', [
      row('a', 'ServiceRecord', 'job-1'),
      row('b', 'ServiceRecord', 'sale-1'),
    ])

    expect(links.get('a')).toBe('/vehicles/veh-1/service/job-1')
    expect(links.get('b')).toBe('/sales/sale-1')
  })

  it('opens a quote, a vehicle, a customer, an inspection and a part', async () => {
    tables.quote.findMany.mockResolvedValue([{ id: 'q-1' }])
    tables.vehicle.findMany.mockResolvedValue([{ id: 'v-1' }])
    tables.customer.findMany.mockResolvedValue([{ id: 'c-1' }])
    tables.inspection.findMany.mockResolvedValue([{ id: 'i-1' }])
    tables.inventoryPart.findMany.mockResolvedValue([{ id: 'p-1' }])

    const links = await activityLinks('org-1', [
      row('a', 'Quote', 'q-1'),
      row('b', 'Vehicle', 'v-1'),
      row('c', 'Customer', 'c-1'),
      row('d', 'Inspection', 'i-1'),
      row('e', 'InventoryPart', 'p-1'),
    ])

    expect(Object.fromEntries(links)).toEqual({
      a: '/quotes/q-1',
      b: '/vehicles/v-1',
      c: '/customers/c-1',
      d: '/inspections/i-1',
      e: '/inventory/p-1',
    })
  })

  it('leaves a row plain when its record is gone or is not this workshop’s', async () => {
    // The query is scoped to the workshop and finds nothing.
    const links = await activityLinks('org-1', [row('a', 'Quote', 'q-deleted')])

    expect(links.has('a')).toBe(false)
    expect(tables.quote.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['q-deleted'] } },
      select: { id: true },
    })
  })

  it('leaves a row plain when it is about something with no page of its own', async () => {
    const links = await activityLinks('org-1', [
      row('a', 'AppSetting', 'setting-1'),
      row('b', null, null),
      row('c', 'Quote', null),
    ])

    expect(links.size).toBe(0)
    // Nothing to look up, so nothing is asked.
    for (const table of Object.values(tables)) expect(table.findMany).not.toHaveBeenCalled()
  })

  it('shows the list without links when the lookup fails', async () => {
    tables.serviceRecord.findMany.mockRejectedValue(new Error('database is away'))

    await expect(
      activityLinks('org-1', [row('a', 'ServiceRecord', 'job-1'), row('b', 'Quote', 'q-1')])
    ).resolves.toEqual(new Map())
  })
})
