/**
 * A backup taken before the customer portal was rebuilt holds the portal's
 * picture under the old background keys. Restored as written, the workshop's
 * cover photo would be gone: the app reads only `portal.cover`, and the
 * migration that renamed the key does not run again after a restore.
 */
import { describe, expect, it } from 'vitest'
import { upgradeLegacySettings } from '@/lib/backup/legacy-settings'

const PICTURE = '/api/protected/files/org-old/portal/3e9a1c3f-0000-4000-8000-000000000001.jpg'
const row = (key: string, value: unknown, id = `id-${key}`) => ({ id, key, value })
const keys = (rows: { key: string }[]) => rows.map((one) => one.key)

describe('settings from a backup older than the portal rebuild', () => {
  it('keeps the uploaded picture as the cover photo and drops the old background keys', () => {
    const restored = upgradeLegacySettings([
      row('company.name', 'Fjordside Auto'),
      row('portal.background.type', 'image'),
      row('portal.background.template', 'workshop'),
      row('portal.background.image', PICTURE, 'bg-1'),
      row('portal.enabled', 'true'),
    ])
    expect(restored).toEqual([
      row('company.name', 'Fjordside Auto'),
      // The same row under its new key: the file is still named by a setting.
      { id: 'bg-1', key: 'portal.cover', value: PICTURE },
      row('portal.enabled', 'true'),
    ])
  })

  it('keeps the picture of a workshop that had switched to a gradient since uploading it', () => {
    const restored = upgradeLegacySettings([
      row('portal.background.type', 'template'),
      row('portal.background.template', 'sunset'),
      row('portal.background.image', PICTURE),
    ])
    expect(restored).toEqual([
      { id: 'id-portal.background.image', key: 'portal.cover', value: PICTURE },
    ])
  })

  it('leaves a workshop that never uploaded a picture without a cover', () => {
    const restored = upgradeLegacySettings([
      row('portal.background.type', 'template'),
      row('portal.background.template', 'sunset'),
      row('portal.background.image', ''),
      row('portal.enabled', 'true'),
    ])
    expect(keys(restored)).toEqual(['portal.enabled'])
  })

  it('lets a cover the backup already names win, and still drops the old keys', () => {
    const cover = '/api/protected/files/org-old/portal/9b1d0000-0000-4000-8000-000000000002.jpg'
    const restored = upgradeLegacySettings([
      row('portal.cover', cover),
      row('portal.background.image', PICTURE),
      row('portal.background.type', 'image'),
    ])
    expect(restored).toEqual([row('portal.cover', cover)])
  })

  it('returns a backup of this version as it is', () => {
    const rows = [row('company.name', 'Fjordside Auto'), row('portal.cover', PICTURE)]
    expect(upgradeLegacySettings(rows)).toEqual(rows)
    expect(upgradeLegacySettings([])).toEqual([])
  })

  it('does not fail on a value that is not text', () => {
    const restored = upgradeLegacySettings([row('portal.background.image', null), row('a', 1)])
    expect(keys(restored)).toEqual(['a'])
  })
})
