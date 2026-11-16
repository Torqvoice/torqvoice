/**
 * Removing several share links at once from Settings. The links go in one
 * write, only inside the workshop, and it takes the right to edit every kind
 * of document among them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const serviceRecord = { updateMany: vi.fn() }
const quote = { updateMany: vi.fn() }
const inspection = { updateMany: vi.fn() }
vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord,
    quote,
    inspection,
    $transaction: (writes: Promise<unknown>[]) => Promise.all(writes),
  },
}))

type Options = {
  requiredPermissions: { action: string; subject: string }[]
  audit: (args: { result: { removed: number } }) => unknown
}
const seen: { options?: Options } = {}
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<{ removed: number }>,
    options: Options
  ) => {
    seen.options = options
    return { success: true, data: await run({ organizationId: 'org1' }) }
  },
}))

const { revokeShareLinks } = await import('@/features/share-links/Actions/revokeShareLinks')

beforeEach(() => {
  vi.clearAllMocks()
  serviceRecord.updateMany.mockResolvedValue({ count: 2 })
  quote.updateMany.mockResolvedValue({ count: 1 })
  inspection.updateMany.mockResolvedValue({ count: 0 })
})

describe('removing several share links', () => {
  const links = [
    { kind: 'invoice', id: 'i1' },
    { kind: 'invoice', id: 'i2' },
    { kind: 'quote', id: 'q1' },
  ]

  it('clears each link inside the workshop and says how many went', async () => {
    const result = await revokeShareLinks({ links })

    expect(result.data).toEqual({ removed: 3 })
    const invoices = serviceRecord.updateMany.mock.calls[0][0]
    expect(invoices.where).toMatchObject({ id: { in: ['i1', 'i2'] }, organizationId: 'org1' })
    expect(invoices.data).toMatchObject({ publicToken: null, shareExpiresAt: null })
    expect(quote.updateMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ['q1'] },
      organizationId: 'org1',
    })
  })

  it('needs the right to edit every kind of document among the links, and no other', async () => {
    await revokeShareLinks({ links })

    expect(seen.options?.requiredPermissions).toEqual([
      { action: 'update', subject: 'services' },
      { action: 'update', subject: 'quotes' },
    ])
  })

  it('leaves no audit entry when nothing was removed', async () => {
    await revokeShareLinks({ links })

    expect(seen.options?.audit({ result: { removed: 0 } })).toBeNull()
  })

  it('refuses an empty list', async () => {
    await expect(revokeShareLinks({ links: [] })).rejects.toThrow()
  })
})
