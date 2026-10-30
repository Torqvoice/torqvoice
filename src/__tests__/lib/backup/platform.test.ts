// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The platform repository's configuration, read from the environment: on the
 * cloud instance only, all of it or none of it, and a password per workshop
 * derived from the master key.
 */

const h = vi.hoisted(() => ({ cloud: true }))

vi.mock('@/lib/features', () => ({ isCloudMode: () => h.cloud }))

type Platform = typeof import('@/lib/backup/platform')

const FULL = {
  PLATFORM_BACKUP_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  PLATFORM_BACKUP_S3_BUCKET: 'torqvoice-workshop-backups',
  PLATFORM_BACKUP_S3_ACCESS_KEY: 'platform-key-id',
  PLATFORM_BACKUP_S3_SECRET_KEY: 'platform-key-secret',
  PLATFORM_BACKUP_MASTER_KEY: 'k7Qe2Vx9Lm4Rt8Zp1Ws6Yd3Hn5Jc0Bf7Gu2Ia9Oq',
}
const KEYS = [...Object.keys(FULL), 'PLATFORM_BACKUP_S3_REGION']
const saved: Record<string, string | undefined> = {}

/** A fresh module, so the "said once in the log" flag starts over. */
async function load(): Promise<Platform> {
  vi.resetModules()
  return import('@/lib/backup/platform')
}

let error: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  h.cloud = true
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  error.mockRestore()
})

describe('platformBackupConfig', () => {
  it('reads a complete configuration, with the region defaulting to auto', async () => {
    Object.assign(process.env, FULL)
    const { platformBackupConfig, platformBackupsEnabled } = await load()
    expect(platformBackupConfig()).toEqual({
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      bucket: 'torqvoice-workshop-backups',
      region: 'auto',
      accessKeyId: 'platform-key-id',
      secretAccessKey: 'platform-key-secret',
      masterKey: FULL.PLATFORM_BACKUP_MASTER_KEY,
    })
    expect(platformBackupsEnabled()).toBe(true)
    expect(error).not.toHaveBeenCalled()
  })

  it('is null when the instance is not the cloud one, however complete the variables are', async () => {
    h.cloud = false
    Object.assign(process.env, FULL)
    const { platformBackupConfig } = await load()
    expect(platformBackupConfig()).toBeNull()
  })

  it('is null, without a word, when nothing is set', async () => {
    const { platformBackupConfig } = await load()
    expect(platformBackupConfig()).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('is null and says so once in the log when only half is set', async () => {
    process.env.PLATFORM_BACKUP_S3_ENDPOINT = FULL.PLATFORM_BACKUP_S3_ENDPOINT
    process.env.PLATFORM_BACKUP_S3_BUCKET = FULL.PLATFORM_BACKUP_S3_BUCKET
    const { platformBackupConfig } = await load()
    expect(platformBackupConfig()).toBeNull()
    expect(platformBackupConfig()).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toMatch(/platform backups are off/)
    expect(String(error.mock.calls[0][0])).toMatch(/ACCESS_KEY/)
    expect(String(error.mock.calls[0][0])).toMatch(/MASTER_KEY/)
    // Nothing secret in the log line.
    expect(String(error.mock.calls[0][0])).not.toContain('platform-key')
  })

  it.each([
    ['http://acc.r2.cloudflarestorage.com'],
    ['https://acc.r2.cloudflarestorage.com/some/path'],
    ['https://user:pass@acc.r2.cloudflarestorage.com'],
    ['not a url'],
  ])('refuses the endpoint %s', async (endpoint) => {
    Object.assign(process.env, FULL, { PLATFORM_BACKUP_S3_ENDPOINT: endpoint })
    const { platformBackupConfig } = await load()
    expect(platformBackupConfig()).toBeNull()
    expect(String(error.mock.calls[0][0])).toMatch(/ENDPOINT/)
  })

  it.each([['ab'], ['Has_Underscore'], ['-leading-dash'], ['double--dash'], ['a'.repeat(64)]])(
    'refuses the bucket %s',
    async (bucket) => {
      Object.assign(process.env, FULL, { PLATFORM_BACKUP_S3_BUCKET: bucket })
      const { platformBackupConfig } = await load()
      expect(platformBackupConfig()).toBeNull()
      expect(String(error.mock.calls[0][0])).toMatch(/BUCKET/)
    }
  )

  it('refuses a master key shorter than 32 characters', async () => {
    Object.assign(process.env, FULL, { PLATFORM_BACKUP_MASTER_KEY: 'x'.repeat(31) })
    const { platformBackupConfig } = await load()
    expect(platformBackupConfig()).toBeNull()
    expect(String(error.mock.calls[0][0])).toMatch(/MASTER_KEY/)
  })

  it('takes the region when one is set', async () => {
    Object.assign(process.env, FULL, { PLATFORM_BACKUP_S3_REGION: 'eu-north-1' })
    const { platformBackupConfig } = await load()
    expect(platformBackupConfig()?.region).toBe('eu-north-1')
  })
})

describe('platformRepositoryPassword', () => {
  it('is the same for the same workshop and different for another', async () => {
    const { platformRepositoryPassword } = await load()
    const key = FULL.PLATFORM_BACKUP_MASTER_KEY
    const a = platformRepositoryPassword(key, 'org1')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(platformRepositoryPassword(key, 'org1')).toBe(a)
    expect(platformRepositoryPassword(key, 'org2')).not.toBe(a)
    expect(platformRepositoryPassword(`${key}x`, 'org1')).not.toBe(a)
  })

  it.each([['org-1'], ['../org1'], ['org1/x'], ['']])(
    'refuses the organisation id %j',
    async (organizationId) => {
      const { platformRepositoryPassword, platformRepository } = await load()
      expect(() => platformRepositoryPassword(FULL.PLATFORM_BACKUP_MASTER_KEY, organizationId)).toThrow(
        /Unexpected organisation id/
      )
      expect(() =>
        platformRepository(
          {
            endpoint: FULL.PLATFORM_BACKUP_S3_ENDPOINT,
            bucket: FULL.PLATFORM_BACKUP_S3_BUCKET,
            region: 'auto',
            accessKeyId: 'a',
            secretAccessKey: 'b',
            masterKey: FULL.PLATFORM_BACKUP_MASTER_KEY,
          },
          organizationId
        )
      ).toThrow(/Unexpected organisation id/)
    }
  )
})

describe('platformBackupAllowed', () => {
  it('follows the plan', async () => {
    const { platformBackupAllowed } = await load()
    expect(platformBackupAllowed({ platformBackups: true })).toBe(true)
    expect(platformBackupAllowed({ platformBackups: false })).toBe(false)
  })
})
