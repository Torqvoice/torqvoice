/**
 * @vitest-environment node
 *
 * Every write tells the screens, without being asked.
 *
 * This is the test for the thing that kept going wrong. Announcing a change
 * used to be a line a developer had to remember in whichever place wrote the
 * row, so a feature written afterwards was silently not live: the technician
 * app's labour endpoint wrote a line nobody was told about, and its status
 * endpoint sent a shape no listener knew. Neither was a socket bug. Both were
 * a forgotten line.
 *
 * The announcement now happens in the Prisma extension, which every write in
 * the app passes through. These tests drive that extension the way Prisma
 * does and check what came out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const published: unknown[] = []
const authors: unknown[] = []
vi.mock('@/lib/realtime/publish.server', () => ({
  publishRecordChange: ({ by, ...input }: { by: unknown }) => {
    published.push(input)
    authors.push(by)
  },
}))

import { runAsActor } from '@/lib/realtime/actor.server'
import {
  realtimeQueryHook,
  resetRealtimeMemory,
  REALTIME_CHILD_MODELS,
  REALTIME_RECORD_MODELS,
} from '@/lib/realtime/prisma-realtime.server'

/** Runs one Prisma operation through the extension, as the client would. */
async function write(
  model: string,
  operation: string,
  args: Record<string, unknown>,
  result: unknown = {},
  organizationOf: (kind: string, id: string) => Promise<string | null> = async () => null
) {
  return realtimeQueryHook({ organizationOf })({
    model,
    operation,
    args,
    query: async () => result,
  })
}

beforeEach(() => {
  published.length = 0
  authors.length = 0
  resetRealtimeMemory()
})

describe('a record written directly', () => {
  it('announces the job that was updated', async () => {
    await write(
      'ServiceRecord',
      'update',
      { where: { id: 'job-1' }, data: { status: 'completed' } },
      { id: 'job-1', organizationId: 'org-1' }
    )

    expect(published).toEqual([
      { kind: 'serviceRecord', id: 'job-1', organizationId: 'org-1', action: 'updated' },
    ])
  })

  it('announces a create, a delete and every kind a screen follows', async () => {
    await write('Vehicle', 'create', { data: {} }, { id: 'v-1', organizationId: 'org-1' })
    await write('Quote', 'delete', { where: { id: 'q-1', organizationId: 'org-1' } })

    expect(published).toEqual([
      { kind: 'vehicle', id: 'v-1', organizationId: 'org-1', action: 'created' },
      { kind: 'quote', id: 'q-1', organizationId: 'org-1', action: 'deleted' },
    ])
  })

  it('looks the workshop up when the write did not name one, once per record', async () => {
    const organizationOf = vi.fn(async () => 'org-7')

    await write('ServiceRecord', 'update', { where: { id: 'job-9' } }, {}, organizationOf)
    await write('ServiceRecord', 'update', { where: { id: 'job-9' } }, {}, organizationOf)

    expect(organizationOf).toHaveBeenCalledTimes(1)
    expect(published).toHaveLength(2)
    expect(published[1]).toMatchObject({ id: 'job-9', organizationId: 'org-7' })
  })

  it('says nothing when there is no workshop to say it to', async () => {
    await write('ServiceRecord', 'update', { where: { id: 'job-x' } }, {})
    expect(published).toEqual([])
  })
})

describe('a row that belongs to a record', () => {
  it('announces the job, because that is what a screen is showing', async () => {
    // The technician app adding a line of work: the desk is looking at the
    // job, not at the labour row.
    await write(
      'ServiceLabor',
      'create',
      { data: { serviceRecordId: 'job-1', hours: 1.5 } },
      { id: 'lab-1', serviceRecordId: 'job-1' },
      async () => 'org-1'
    )

    expect(published).toEqual([
      {
        kind: 'serviceRecord',
        id: 'job-1',
        organizationId: 'org-1',
        hint: 'labor',
      },
    ])
  })

  it('does the same for a photo, a payment and a clock entry', async () => {
    const org = async () => 'org-1'
    await write('ServiceAttachment', 'delete', { where: { serviceRecordId: 'job-1' } }, {}, org)
    await write('Payment', 'create', { data: { serviceRecordId: 'job-1' } }, {}, org)
    await write('TimeEntry', 'update', { where: { serviceRecordId: 'job-1' } }, {}, org)

    expect(published.map((p) => (p as { hint: string }).hint)).toEqual([
      'attachments',
      'payments',
      'clock',
    ])
  })
})

describe('a bulk write', () => {
  it('names no record, so only the workshop lists hear it', async () => {
    await write('ServiceRecord', 'updateMany', {
      where: { organizationId: 'org-1', status: 'pending' },
      data: { status: 'in-progress' },
    })

    expect(published).toEqual([
      { kind: 'serviceRecord', id: null, organizationId: 'org-1', action: 'updated' },
    ])
  })
})

describe('what is not announced', () => {
  it('a read', async () => {
    await write('ServiceRecord', 'findMany', { where: { organizationId: 'org-1' } }, [])
    await write('ServiceRecord', 'count', { where: { organizationId: 'org-1' } }, 3)
    expect(published).toEqual([])
  })

  it('a model no screen follows', async () => {
    await write('AuditLog', 'create', { data: { organizationId: 'org-1' } }, { id: 'a-1' })
    expect(published).toEqual([])
  })
})

describe('a write that goes wrong', () => {
  it('fails the way it would have, and tells nobody', async () => {
    const hook = realtimeQueryHook({ organizationOf: async () => 'org-1' })

    await expect(
      hook({
        model: 'ServiceRecord',
        operation: 'update',
        args: { where: { id: 'job-1' } },
        query: async () => {
          throw new Error('unique constraint')
        },
      })
    ).rejects.toThrow('unique constraint')

    expect(published).toEqual([])
  })
})

describe('the models it knows', () => {
  it('covers the records a page can follow, and their parts', () => {
    // Guards the guard: this list is what makes a feature live by default, so
    // a record kind added without a model here would be silently static.
    expect(Object.values(REALTIME_RECORD_MODELS).sort()).toEqual([
      'customer',
      'inspection',
      'inventoryPart',
      'quote',
      'serviceRecord',
      'tireSet',
      'vehicle',
    ])
    for (const [model, child] of Object.entries(REALTIME_CHILD_MODELS)) {
      expect(Object.values(REALTIME_RECORD_MODELS), model).toContain(child.parent)
      expect(child.fk, model).toMatch(/Id$/)
    }
  })
})

describe('a work order saving its lines', () => {
  // The save deletes every line and writes them again. Both are plural
  // writes, and both name the one job they belong to, so that job's page is
  // told rather than the write being treated as anonymous.
  it('announces the job when its lines are deleted together', async () => {
    await write(
      'ServiceLabor',
      'deleteMany',
      { where: { serviceRecordId: 'job-1' } },
      { count: 4 },
      async () => 'org-1'
    )

    expect(published).toEqual([
      { kind: 'serviceRecord', id: 'job-1', organizationId: 'org-1', hint: 'labor' },
    ])
  })

  it('announces the job when its lines are written together', async () => {
    await write(
      'ServicePart',
      'createMany',
      { data: [{ serviceRecordId: 'job-1' }, { serviceRecordId: 'job-1' }] },
      { count: 2 },
      async () => 'org-1'
    )

    expect(published).toEqual([
      { kind: 'serviceRecord', id: 'job-1', organizationId: 'org-1', hint: 'parts' },
    ])
  })

  it('tells only the workshop when one write touches more jobs than is worth naming', async () => {
    const data = Array.from({ length: 40 }, (_, i) => ({
      serviceRecordId: `job-${i}`,
      organizationId: 'org-1',
    }))
    await write('ServicePart', 'createMany', { data }, { count: 40 })

    expect(published).toEqual([
      { kind: 'serviceRecord', id: null, organizationId: 'org-1', hint: 'parts' },
    ])
  })
})

describe('whose change it was', () => {
  it('is the person who asked, even when the query answers from somewhere else', async () => {
    // Prisma resolves a query from its own machinery. Whoever is "current"
    // by then is not to be trusted, so the author is read before the query.
    const christian = { userId: 'u-1', name: 'Christian', source: 'web' as const }
    await runAsActor(christian, async () =>
      realtimeQueryHook({ organizationOf: async () => null })({
        model: 'ServiceRecord',
        operation: 'update',
        args: { where: { id: 'job-1' }, data: {} },
        // Answers outside the actor's scope, as a pooled connection would.
        query: () =>
          new Promise((resolve) => {
            runAsActor({ userId: 'somebody-else', name: null, source: 'web' }, () =>
              setTimeout(() => resolve({ id: 'job-1', organizationId: 'org-1' }), 0)
            )
          }),
      })
    )

    expect(authors).toEqual([christian])
  })

  it('is the system when nobody asked: a scheduled job, a script', async () => {
    await write('ServiceRecord', 'update', { where: { id: 'job-1', organizationId: 'org-1' } })
    expect(authors).toEqual([{ userId: null, name: null, source: 'system' }])
  })
})
