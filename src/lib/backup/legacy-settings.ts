/**
 * Settings as an older version of the app wrote them, brought up to the keys
 * this version reads, before a backup's settings are restored.
 *
 * A key is renamed once, in a database migration. That migration has already
 * run when a backup taken before it is restored, and it never runs again, so
 * without this the restore would put the old keys back and the app, which
 * only reads the new ones, would behave as if the setting had never been
 * made. Each rename a migration makes to `app_settings` gets its twin here.
 *
 * Pure: rows in, rows out. A backup that already has the new keys, or none
 * of the old ones, comes back as it was.
 */

/** The keys the customer portal's background used before its cover photo. */
const PORTAL_BACKGROUND_IMAGE = 'portal.background.image'
const PORTAL_BACKGROUND_KEYS: readonly string[] = [
  'portal.background.type',
  'portal.background.template',
  PORTAL_BACKGROUND_IMAGE,
]
const PORTAL_COVER = 'portal.cover'

/**
 * The portal's uploaded background picture becomes its cover photo, as
 * migration 20261115130000_portal_messages did for the live rows: wherever a
 * picture was uploaded (a workshop that later switched to a gradient still
 * owns the file), unless the backup already names a cover. The three
 * `portal.background.*` rows are then dropped; nothing reads them.
 *
 * The picture's row keeps its id and its value, so the file it points at is
 * still mentioned by a setting and the file manager goes on keeping it.
 */
export function upgradeLegacySettings<T extends { key: string; value: unknown }>(
  rows: readonly T[]
): T[] {
  if (!rows.some((row) => PORTAL_BACKGROUND_KEYS.includes(row.key))) return [...rows]

  const hasCover = rows.some((row) => row.key === PORTAL_COVER)
  const picture = hasCover
    ? undefined
    : rows.find(
        (row) =>
          row.key === PORTAL_BACKGROUND_IMAGE &&
          typeof row.value === 'string' &&
          row.value.trim() !== ''
      )

  const upgraded: T[] = []
  for (const row of rows) {
    if (row === picture) upgraded.push({ ...row, key: PORTAL_COVER })
    else if (!PORTAL_BACKGROUND_KEYS.includes(row.key)) upgraded.push(row)
  }
  return upgraded
}
