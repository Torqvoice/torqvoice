import { db } from '@/lib/db'

type ActivityRow = { id: string; entity: string | null; entityId: string | null }

/** The kinds of record an activity row can open, and the page each lives on. */
const PAGES = {
  Vehicle: (id: string) => `/vehicles/${id}`,
  Quote: (id: string) => `/quotes/${id}`,
  Customer: (id: string) => `/customers/${id}`,
  Inspection: (id: string) => `/inspections/${id}`,
  InventoryPart: (id: string) => `/inventory/${id}`,
} as const

type PagedEntity = keyof typeof PAGES

/** The ids of one kind that still exist in this workshop. */
async function existing(
  entity: PagedEntity,
  organizationId: string,
  ids: string[]
): Promise<string[]> {
  const where = { organizationId, id: { in: ids } }
  const select = { id: true } as const
  const found =
    entity === 'Vehicle'
      ? await db.vehicle.findMany({ where, select })
      : entity === 'Quote'
        ? await db.quote.findMany({ where, select })
        : entity === 'Customer'
          ? await db.customer.findMany({ where, select })
          : entity === 'Inspection'
            ? await db.inspection.findMany({ where, select })
            : await db.inventoryPart.findMany({ where, select })
  return found.map((row) => row.id)
}

/**
 * Where each row of the activity list leads: the work order, quote, vehicle,
 * customer, inspection or part it is about. Keyed by the row's own id.
 *
 * A row gets a link only while its record is still there and belongs to this
 * workshop, so a "deleted" row, or one about something with no page of its
 * own, stays plain text. A work order needs its vehicle to be addressed, and a
 * counter sale has none, which is why these are looked up rather than built
 * from the id alone.
 *
 * The list is a convenience on the dashboard: if the lookup fails, the rows
 * are shown without links rather than the page failing.
 */
export async function activityLinks(
  organizationId: string,
  rows: ActivityRow[]
): Promise<Map<string, string>> {
  const links = new Map<string, string>()
  const idsOf = (entity: string) => [
    ...new Set(rows.filter((r) => r.entity === entity && r.entityId).map((r) => r.entityId!)),
  ]
  try {
    const jobIds = idsOf('ServiceRecord')
    const [jobs, ...paged] = await Promise.all([
      jobIds.length
        ? db.serviceRecord.findMany({
            where: { organizationId, id: { in: jobIds } },
            select: { id: true, vehicleId: true },
          })
        : [],
      ...(Object.keys(PAGES) as PagedEntity[]).map(async (entity) => {
        const ids = idsOf(entity)
        return { entity, ids: ids.length ? await existing(entity, organizationId, ids) : [] }
      }),
    ])

    const hrefs = new Map<string, string>()
    for (const job of jobs) {
      hrefs.set(
        `ServiceRecord:${job.id}`,
        job.vehicleId ? `/vehicles/${job.vehicleId}/service/${job.id}` : `/sales/${job.id}`
      )
    }
    for (const { entity, ids } of paged) {
      for (const id of ids) hrefs.set(`${entity}:${id}`, PAGES[entity](id))
    }
    for (const row of rows) {
      const href = hrefs.get(`${row.entity}:${row.entityId}`)
      if (href) links.set(row.id, href)
    }
  } catch {
    return new Map()
  }
  return links
}
