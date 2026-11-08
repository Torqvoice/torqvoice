import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A customer's portal lists the quotes the workshop sent them. A draft is the
 * workshop's working copy, with prices it may still change, and used to show
 * up in the portal before it was ever sent.
 */

type Quote = {
  id: string
  title: string
  status: string
  customerId: string
  organizationId: string
  sentAt?: Date | null
  sharedAt?: Date | null
}

const quotes: Quote[] = []

/**
 * The parts of a Prisma `where` the portal uses (equals, `not`, `in`, `OR`),
 * applied to the rows above. A key it does not understand fails the row, so a
 * new condition cannot pass by being ignored.
 */
function matches(q: Quote, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(q, w))) return false
      continue
    }
    const value = q[key as keyof Quote] ?? null
    if (cond !== null && typeof cond === 'object') {
      const c = cond as Record<string, unknown>
      for (const op of Object.keys(c)) {
        if (op === 'not') {
          if (c.not === null ? value === null : value === c.not) return false
        } else if (op === 'in') {
          if (!(c.in as unknown[]).includes(value)) return false
        } else {
          return false
        }
      }
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        quotes.filter((q) => matches(q, where))
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          quotes.filter((q) => matches(q, where)).length
      ),
    },
    customer: {
      findUnique: vi.fn(async () => ({ name: 'Sarah Coleman', email: 's@example.com' })),
    },
    vehicle: { findMany: vi.fn(async () => []) },
    serviceRecord: { findMany: vi.fn(async () => []) },
    serviceRequest: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))

import { getPortalDashboard, getPortalQuotes } from '@/features/portal/Actions/portalActions'

describe('quotes in the customer portal', () => {
  beforeEach(() => {
    quotes.length = 0
    quotes.push(
      {
        id: 'q1',
        title: 'Brake overhaul',
        status: 'sent',
        customerId: 'c1',
        organizationId: 'org1',
      },
      {
        id: 'q2',
        title: 'Suspension refresh',
        status: 'draft',
        customerId: 'c1',
        organizationId: 'org1',
      },
      {
        id: 'q3',
        title: 'Annual service',
        status: 'accepted',
        customerId: 'c1',
        organizationId: 'org1',
      },
      // Turned straight into a work order from a draft: converted, but never sent.
      {
        id: 'q4',
        title: 'Clutch kit',
        status: 'converted',
        customerId: 'c1',
        organizationId: 'org1',
      },
      // Sent, then converted when the customer said yes.
      {
        id: 'q5',
        title: 'Timing belt',
        status: 'converted',
        customerId: 'c1',
        organizationId: 'org1',
        sentAt: new Date('2026-10-01T12:00:00Z'),
      }
    )
  })

  it('lists the quotes the workshop sent, and not its drafts', async () => {
    const result = await getPortalQuotes()
    expect(result.data?.map((q) => q.title)).toEqual([
      'Brake overhaul',
      'Annual service',
      'Timing belt',
    ])
  })

  it('leaves out a draft that became a work order without ever being sent', async () => {
    const result = await getPortalQuotes()
    expect(result.data?.map((q) => q.title)).not.toContain('Clutch kit')
  })

  it('keeps drafts off the dashboard too', async () => {
    const result = await getPortalDashboard()
    const titles = (result.data as { recentQuotes: { title: string }[] }).recentQuotes.map(
      (q) => q.title
    )
    expect(titles).not.toContain('Suspension refresh')
    expect(titles).not.toContain('Clutch kit')
    expect(titles).toContain('Brake overhaul')
  })
})
