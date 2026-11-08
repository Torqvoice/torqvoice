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
}

const quotes: Quote[] = []

/** The part of a Prisma `where` the portal uses, applied to the rows above. */
function matches(q: Quote, where: Record<string, unknown>) {
  if (where.customerId && q.customerId !== where.customerId) return false
  if (where.organizationId && q.organizationId !== where.organizationId) return false
  const status = where.status as { not?: string } | string | undefined
  if (typeof status === 'string' && q.status !== status) return false
  if (status && typeof status === 'object' && status.not && q.status === status.not) return false
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
      }
    )
  })

  it('lists the quotes the workshop sent, and not its drafts', async () => {
    const result = await getPortalQuotes()
    expect(result.data?.map((q) => q.title)).toEqual(['Brake overhaul', 'Annual service'])
  })

  it('keeps drafts off the dashboard too', async () => {
    const result = await getPortalDashboard()
    const titles = (result.data as { recentQuotes: { title: string }[] }).recentQuotes.map(
      (q) => q.title
    )
    expect(titles).not.toContain('Suspension refresh')
    expect(titles).toContain('Brake overhaul')
  })
})
