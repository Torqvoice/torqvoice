/**
 * Deleting a status report asks for the right of whatever it was sent from:
 * a job's report needs the services right, an inspection's the inspections
 * right. The row says which, so it is read first under the session alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { statusReport, required } = vi.hoisted(() => ({
  statusReport: { findFirst: vi.fn(), delete: vi.fn() },
  required: [] as unknown[],
}))
vi.mock('@/lib/db', () => ({ db: { statusReport } }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn(async () => undefined) }))

vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>,
    options?: { requiredPermissions?: unknown[] }
  ) => {
    required.push(options?.requiredPermissions ?? null)
    try {
      return { success: true, data: await fn({ organizationId: 'org', userId: 'user' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { deleteStatusReport } from '@/features/status-reports/Actions/deleteStatusReport'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

beforeEach(() => {
  vi.clearAllMocks()
  required.length = 0
})

describe('whose right a delete needs', () => {
  it("the inspections right for an inspection's report", async () => {
    statusReport.findFirst.mockResolvedValue({
      id: 'rep',
      videoUrl: null,
      organizationId: 'org',
      inspectionId: 'insp-1',
    })
    const result = await deleteStatusReport('rep')
    expect(result.success).toBe(true)
    expect(required).toEqual([
      null,
      [{ action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS }],
    ])
    expect(statusReport.delete).toHaveBeenCalledWith({ where: { id: 'rep' } })
  })

  it("the services right for a job's report", async () => {
    statusReport.findFirst.mockResolvedValue({
      id: 'rep',
      videoUrl: null,
      organizationId: 'org',
      inspectionId: null,
    })
    await deleteStatusReport('rep')
    expect(required[1]).toEqual([
      { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
    ])
  })

  it('deletes nothing it cannot find', async () => {
    statusReport.findFirst.mockResolvedValue(null)
    const result = await deleteStatusReport('nope')
    expect(result.success).toBe(false)
    expect(statusReport.delete).not.toHaveBeenCalled()
  })
})
