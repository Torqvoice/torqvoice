// @vitest-environment node
/**
 * The job runner leaves a workshop being restored out of its batch, so that
 * workshop's queued jobs cannot fill every batch and hold up everyone else's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    integrationJob: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/integrations/registry', () => ({ getManifest: vi.fn() }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))
vi.mock('@/features/integrations/Lib/connections', () => ({
  loadConnection: vi.fn(),
  setConnectionStatus: vi.fn(),
  writeLog: vi.fn(),
}))

import { db } from '@/lib/db'
import { freezeOrganization, unfreezeOrganization } from '@/lib/backup/freeze'
import { runDueJobs } from '@/features/integrations/Lib/jobs'

beforeEach(() => {
  vi.mocked(db.integrationJob.findMany).mockReset()
  vi.mocked(db.integrationJob.updateMany).mockReset()
  // No job can be claimed, so runJob stops right after the claim.
  vi.mocked(db.integrationJob.updateMany).mockResolvedValue({ count: 0 } as never)
})

afterEach(() => {
  unfreezeOrganization('org-restoring')
})

describe('runDueJobs', () => {
  it('asks for every workshop when none is frozen', async () => {
    vi.mocked(db.integrationJob.findMany).mockResolvedValue([] as never)
    await runDueJobs()
    const where = vi.mocked(db.integrationJob.findMany).mock.calls[0][0]?.where
    expect(where).toMatchObject({ status: 'queued' })
    expect(where).not.toHaveProperty('organizationId')
  })

  it('leaves a frozen workshop out of the query', async () => {
    freezeOrganization('org-restoring')
    vi.mocked(db.integrationJob.findMany).mockResolvedValue([] as never)
    await runDueJobs(10)
    const args = vi.mocked(db.integrationJob.findMany).mock.calls[0][0]
    expect(args?.where).toMatchObject({
      status: 'queued',
      organizationId: { notIn: ['org-restoring'] },
    })
    expect(args?.take).toBe(10)
  })

  it('still skips a job whose workshop froze after the query', async () => {
    vi.mocked(db.integrationJob.findMany).mockImplementation((async () => {
      freezeOrganization('org-restoring')
      return [
        { id: 'job-frozen', organizationId: 'org-restoring' },
        { id: 'job-live', organizationId: 'org-live' },
      ]
    }) as never)

    await runDueJobs()

    // Only the live workshop's job is claimed.
    const claimed = vi
      .mocked(db.integrationJob.updateMany)
      .mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id)
    expect(claimed).toEqual(['job-live'])
  })
})
