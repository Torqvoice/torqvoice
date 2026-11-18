import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import { connector, localRepositoryPath } from '@/integrations/local-folder/server'

/**
 * The local folder destination keeps one repository folder per workshop
 * under the backup root. The Folder setting names it, so a new install can
 * be pointed at the folder an earlier install wrote; nothing typed there can
 * reach a folder outside the root.
 */
const ROOT = path.resolve('/srv/torqvoice-backups')
const ORG = 'cm0org1abc'

describe('local folder repository path', () => {
  const previous = process.env.BACKUP_LOCAL_ROOT

  beforeEach(() => {
    process.env.BACKUP_LOCAL_ROOT = ROOT
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.BACKUP_LOCAL_ROOT
    else process.env.BACKUP_LOCAL_ROOT = previous
  })

  it('is named after the workshop by default', () => {
    expect(localRepositoryPath(ORG)).toBe(path.join(ROOT, ORG))
    expect(localRepositoryPath(ORG, undefined)).toBe(path.join(ROOT, ORG))
    expect(localRepositoryPath(ORG, 42)).toBe(path.join(ROOT, ORG))
  })

  it('uses the folder name the person typed, trimmed', () => {
    expect(localRepositoryPath(ORG, 'cm0oldinstall9')).toBe(path.join(ROOT, 'cm0oldinstall9'))
    expect(localRepositoryPath(ORG, '  main-shop_2024.v1  ')).toBe(
      path.join(ROOT, 'main-shop_2024.v1')
    )
  })

  it('falls back to the workshop when the name is empty after trimming', () => {
    expect(localRepositoryPath(ORG, '')).toBe(path.join(ROOT, ORG))
    expect(localRepositoryPath(ORG, '   ')).toBe(path.join(ROOT, ORG))
  })

  it('refuses a name that is a path or climbs out of the root', () => {
    const message = 'The folder name may only hold letters, digits, dots, dashes and underscores'
    for (const name of ['.', '..', 'a/b', '/abs', '../other', 'a\\b', '.hidden', 'x'.repeat(101)]) {
      expect(() => localRepositoryPath(ORG, name), name).toThrow(message)
    }
  })

  it('works under a root given as / or with .. in it', () => {
    process.env.BACKUP_LOCAL_ROOT = '/'
    expect(localRepositoryPath(ORG, 'shop')).toBe(path.join('/', 'shop'))
    process.env.BACKUP_LOCAL_ROOT = `${ROOT}/../other`
    expect(localRepositoryPath(ORG, 'shop')).toBe(path.join(ROOT, '..', 'other', 'shop'))
  })

  it('refuses a folder that would resolve outside the root, or onto the root itself', () => {
    // No name the pattern lets through can do this, so the join is bent to
    // prove the second guard holds on its own.
    const join = vi.spyOn(path, 'join')
    try {
      join.mockReturnValueOnce('/etc')
      expect(() => localRepositoryPath(ORG, 'shop')).toThrow(
        'The folder must be inside the backup root'
      )
      join.mockReturnValueOnce(ROOT)
      expect(() => localRepositoryPath(ORG, 'shop')).toThrow(
        'The folder must be inside the backup root'
      )
      join.mockReturnValueOnce(`${ROOT}-sibling/shop`)
      expect(() => localRepositoryPath(ORG, 'shop')).toThrow(
        'The folder must be inside the backup root'
      )
    } finally {
      join.mockRestore()
    }
  })

  it('is what the connector backs up to and checks, from the saved setting', async () => {
    const ctx = {
      connection: { organizationId: ORG, settings: { folder: 'cm0oldinstall9' } },
    } as unknown as ConnectorContext
    await expect(connector.backupTarget?.repository(ctx)).resolves.toEqual({
      repository: path.join(ROOT, 'cm0oldinstall9'),
      env: {},
    })
    await expect(connector.identify?.(ctx)).resolves.toMatchObject({
      id: path.join(ROOT, 'cm0oldinstall9'),
    })
    await expect(
      connector.previewTest?.({ organizationId: ORG, credentials: {}, settings: { folder: '..' } })
    ).resolves.toMatchObject({ ok: false, step: 'folder' })
  })

  it('still refuses an unexpected workshop id', () => {
    expect(() => localRepositoryPath('../evil', 'shop')).toThrow('Unexpected organisation id')
  })
})
