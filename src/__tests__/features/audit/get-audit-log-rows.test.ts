/**
 * @vitest-environment node
 *
 * The audit log loads as it scrolls (getAuditLogRows). What a person relies
 * on: every entry turns up once, newest first, however many share a second;
 * the filters hold for every batch, not just the first; and a workshop only
 * ever sees its own log.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { walkBatches } from '@/__tests__/helpers/in-memory-table'

type Log = {
  id: string
  organizationId: string
  timestamp: Date
  action: string
  entity: string | null
  entityId: string | null
  message: string | null
  userId: string | null
  user: { id: string; name: string; email: string } | null
}

const state = vi.hoisted(() => ({ logs: [] as Log[], options: [] as unknown[] }))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return { db: { auditLog: inMemoryTable(() => state.logs) } }
})
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<unknown>,
    options?: unknown
  ) => {
    state.options.push(options)
    try {
      return { success: true, data: await run({ organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
}))

import { getAuditLogRows } from '@/features/audit/Actions/getAuditLogRows'

const ann = { id: 'u-ann', name: 'Ann', email: 'ann@example.com' }
const bo = { id: 'u-bo', name: 'Bo', email: 'bo@example.com' }

function makeLogs(): Log[] {
  return Array.from({ length: 137 }, (_, i) => {
    const user = i % 3 === 0 ? bo : ann
    return {
      id: `log-${String((i * 37) % 137).padStart(3, '0')}`,
      organizationId: i % 10 === 9 ? 'org-2' : 'org-1',
      // Many entries in the same second, so the id has to break the ties.
      timestamp: new Date(Date.UTC(2026, 10, 1, 9, 0, Math.floor(i / 4))),
      action: i % 2 === 0 ? 'invoice.sent' : 'customer.update',
      entity: i % 2 === 0 ? 'invoice' : 'customer',
      entityId: `e-${i}`,
      message: i % 5 === 0 ? 'Brake job emailed' : 'Changed phone',
      userId: user.id,
      user,
    }
  })
}

/** The ids the list should show, in order: newest first, ties by id. */
function expected(filter: (log: Log) => boolean) {
  return state.logs
    .filter((log) => log.organizationId === 'org-1' && filter(log))
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime() || (a.id < b.id ? -1 : 1))
    .map((log) => log.id)
}

beforeEach(() => {
  state.logs = makeLogs()
  state.options = []
})

describe('the audit log in batches', () => {
  it('shows every entry of the workshop once, newest first', async () => {
    const { ids: seen } = await walkBatches(getAuditLogRows, (cursor) => ({ cursor }))
    expect(seen).toEqual(expected(() => true))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('sends 50 rows, the total and the filter choices with the first batch only', async () => {
    const first = await getAuditLogRows({})
    expect(first.data?.rows).toHaveLength(50)
    expect(first.data?.total).toBe(expected(() => true).length)
    expect(first.data?.filters?.actions).toEqual(['customer.update', 'invoice.sent'])
    expect(first.data?.filters?.users.map((u) => u.id).sort()).toEqual(['u-ann', 'u-bo'])

    const second = await getAuditLogRows({ cursor: first.data?.nextCursor })
    expect(second.data?.total).toBeUndefined()
    expect(second.data?.filters).toBeUndefined()
  })

  it('keeps the filters on every batch', async () => {
    const { ids: seen } = await walkBatches(getAuditLogRows, (cursor) => ({
      action: 'invoice.sent',
      userId: 'u-ann',
      cursor,
    }))
    expect(seen).toEqual(expected((log) => log.action === 'invoice.sent' && log.userId === 'u-ann'))
  })

  it('searches the message and the person on every batch', async () => {
    const { ids: seen } = await walkBatches(getAuditLogRows, (cursor) => ({
      search: 'brake',
      cursor,
    }))
    expect(seen).toEqual(expected((log) => log.message === 'Brake job emailed'))
    const { ids: byName } = await walkBatches(getAuditLogRows, (cursor) => ({
      search: 'BO@EX',
      cursor,
    }))
    expect(byName).toEqual(expected((log) => log.userId === 'u-bo'))
  })

  it('never shows another workshop its entries', async () => {
    const { ids: seen } = await walkBatches(getAuditLogRows, (cursor) => ({ cursor }))
    const theirs = state.logs.filter((log) => log.organizationId === 'org-2').map((log) => log.id)
    expect(theirs.length).toBeGreaterThan(0)
    expect(seen.some((id) => theirs.includes(id))).toBe(false)
  })

  it('asks for no more than the old list did: any signed-in member of the workshop', async () => {
    await getAuditLogRows({})
    expect(state.options[0]).toBeUndefined()
  })

  it('refuses a cursor that does not fit the list', async () => {
    const result = await getAuditLogRows({ cursor: { v: [1, 2], id: 'x' } })
    expect(result.success).toBe(false)
  })
})
