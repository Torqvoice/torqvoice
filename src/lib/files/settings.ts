import 'server-only'

import { db } from '@/lib/db'
import { releaseFiles } from './manager'

/**
 * Settings whose value is a file (the workshop logo, the invoice and quote
 * logos, the portal background) used to have their old file deleted by the
 * upload route, before the new value was even saved, and whatever else used
 * the same file lost it: the invoice designer uploads through the logo route,
 * so a design's new logo deleted the company logo.
 *
 * Now nothing is deleted at upload. A save reads the values it is about to
 * replace with `settingValuesBefore`, and once it has committed,
 * `releaseReplacedSettingFiles` hands the ones that changed to the file
 * manager, which ignores anything that is not an uploaded file and keeps a
 * file some design, snapshot or other setting still uses. An upload that is
 * never saved is picked up by the orphan sweep.
 */
export async function settingValuesBefore(organizationId: string, keys: string[]) {
  if (keys.length === 0) return new Map<string, string>()
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: keys } },
    select: { key: true, value: true },
  })
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function releaseReplacedSettingFiles(
  organizationId: string,
  before: Map<string, string>,
  after: Record<string, string>
) {
  const replaced = [...before].filter(([key, value]) => key in after && after[key] !== value)
  if (replaced.length === 0) return
  await releaseFiles(
    replaced.map(([, value]) => value),
    { organizationId, reason: 'setting file replaced' }
  )
}
