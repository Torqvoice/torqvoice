// @vitest-environment node
/**
 * A customer's reply on a shared status report waits for a restore of the
 * workshop, like every other write: it would be lost under the restore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { statusReport: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))

import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import {
  RestoreInProgressError,
  freezeOrganization,
  unfreezeOrganization,
} from '@/lib/backup/freeze'
import { submitStatusReportFeedback } from '@/features/status-reports/Actions/submitFeedback'

const REPORT = {
  id: 'rep-1',
  organizationId: 'org-1',
  expiresAt: null,
  customerFeedback: null,
  serviceRecord: null,
  inspection: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.statusReport.findUnique).mockResolvedValue(REPORT as never)
  vi.mocked(db.statusReport.update).mockResolvedValue({} as never)
})

afterEach(() => {
  unfreezeOrganization('org-1')
})

describe('submitStatusReportFeedback', () => {
  it('refuses while the workshop is being restored and writes nothing', async () => {
    freezeOrganization('org-1')
    await expect(
      submitStatusReportFeedback({ token: 'tok-1', feedback: 'Looks good' })
    ).rejects.toBeInstanceOf(RestoreInProgressError)
    expect(db.statusReport.update).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('saves the feedback when the workshop is not frozen', async () => {
    freezeOrganization('org-other')
    try {
      await submitStatusReportFeedback({ token: 'tok-1', feedback: 'Looks good' })
      expect(db.statusReport.update).toHaveBeenCalledTimes(1)
    } finally {
      unfreezeOrganization('org-other')
    }
  })
})
