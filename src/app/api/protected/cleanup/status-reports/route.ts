import { NextResponse } from 'next/server'
import { cleanupExpiredReports } from '@/features/status-reports/Actions/cleanupExpiredReports'
import { getAuthContext } from '@/lib/get-auth-context'

/**
 * The manual twin of the cron route (api/v1/cron/cleanup-status-reports).
 *
 * The cleanup runs across every workshop on the instance, so it is the
 * platform's to trigger, not any one workshop's: a super admin only. Being
 * signed in was the whole check once, which let any account, and on the
 * public demo anybody at all, delete other workshops' expired reports on
 * demand. Nothing in the app calls this; the cron route is the scheduled path.
 */
export async function POST() {
  const auth = await getAuthContext()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!auth.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await cleanupExpiredReports()
  return NextResponse.json(result)
}
