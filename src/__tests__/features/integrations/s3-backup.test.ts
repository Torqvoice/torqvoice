import { describe, expect, it } from 'vitest'
import { endpointHost, repositoryFor, S3SettingsError } from '@/integrations/s3/server'
import { describeRepository, sanitizeRepository } from '@/lib/backup/target'

/**
 * The address restic is pointed at is built from typed settings. These tests
 * prove nothing typed can carry a host, a path or a scheme of its own into
 * the endpoint, and that the one typed address only exists self-hosted.
 */
const creds = { accessKeyId: 'AKIA', secretAccessKey: 'shh' }

describe('s3 repository address', () => {
  it('builds the vendor endpoints from fixed patterns', () => {
    expect(
      repositoryFor(
        { provider: 'aws', region: 'eu-central-1', bucket: 'shop', prefix: 'tv' },
        creds,
        true
      )
    ).toEqual({
      repository: 's3:https://s3.eu-central-1.amazonaws.com/shop/tv',
      env: { AWS_ACCESS_KEY_ID: 'AKIA', AWS_SECRET_ACCESS_KEY: 'shh' },
      options: { 's3.region': 'eu-central-1' },
    })
    expect(
      repositoryFor({ provider: 'r2', accountId: 'a'.repeat(32), bucket: 'shop' }, creds, true)
        .repository
    ).toBe(`s3:https://${'a'.repeat(32)}.r2.cloudflarestorage.com/shop/torqvoice`)
    expect(endpointHost('b2', { region: 'us-west-004' }, undefined, true).host).toBe(
      's3.us-west-004.backblazeb2.com'
    )
    expect(endpointHost('wasabi', { region: 'eu-central-1' }, undefined, true).host).toBe(
      's3.eu-central-1.wasabisys.com'
    )
    expect(endpointHost('hetzner', { region: 'fsn1' }, undefined, true).host).toBe(
      'fsn1.your-objectstorage.com'
    )
  })

  it('refuses a region, account id, bucket or prefix that could change the host or path', () => {
    const bad = (settings: Record<string, unknown>, field: string) => {
      try {
        repositoryFor(
          { provider: 'aws', region: 'eu-west-1', bucket: 'shop', ...settings },
          creds,
          true
        )
      } catch (err) {
        expect(err).toBeInstanceOf(S3SettingsError)
        expect((err as S3SettingsError).field).toBe(field)
        return
      }
      throw new Error('expected a refusal')
    }
    bad({ region: 'eu-west-1.evil.com' }, 'region')
    bad({ region: 'eu-west-1/..' }, 'region')
    bad({ region: 'EU west' }, 'region')
    bad({ region: '' }, 'region')
    bad({ bucket: 'a' }, 'bucket')
    bad({ bucket: 'shop/other' }, 'bucket')
    bad({ bucket: 'shop.other' }, 'bucket')
    bad({ bucket: 'shop--x' }, 'bucket')
    bad({ prefix: '../other' }, 'prefix')
    bad({ prefix: 'a//b' }, 'prefix')
    bad({ prefix: '/abs' }, 'prefix')
    bad({ prefix: 'x?y' }, 'prefix')
    bad({ provider: 'r2', accountId: 'not-hex' }, 'accountId')
    bad({ provider: 'nope' }, 'provider')
  })

  it('never takes a custom endpoint on the cloud instance', () => {
    expect(() =>
      repositoryFor(
        { provider: 'other', bucket: 'shop' },
        { ...creds, endpoint: 'https://minio.internal:9000' },
        true
      )
    ).toThrow(S3SettingsError)
  })

  it('takes a plain host, with a port, as the self-hosted custom endpoint', () => {
    const repo = repositoryFor(
      { provider: 'other', bucket: 'shop', region: 'us-east-1' },
      { ...creds, endpoint: 'https://minio.internal:9000' },
      false
    )
    expect(repo.repository).toBe('s3:https://minio.internal:9000/shop/torqvoice')
    expect(
      repositoryFor(
        { provider: 'other', bucket: 'shop' },
        { ...creds, endpoint: 'http://192.168.1.5:9000' },
        false
      ).repository
    ).toBe('s3:http://192.168.1.5:9000/shop/torqvoice')
    for (const endpoint of [
      'https://user:pw@minio.internal',
      'https://minio.internal/path',
      'https://minio.internal/?x=1',
      'ftp://minio.internal',
      'not a url at all',
      '',
    ]) {
      expect(() =>
        repositoryFor({ provider: 'other', bucket: 'shop' }, { ...creds, endpoint }, false)
      ).toThrow(S3SettingsError)
    }
  })

  it('requires both keys', () => {
    expect(() =>
      repositoryFor(
        { provider: 'aws', region: 'eu-west-1', bucket: 'shop' },
        { accessKeyId: 'x' },
        true
      )
    ).toThrow(S3SettingsError)
  })
})

describe('sanitizeRepository', () => {
  it('drops the env the runner owns and malformed names', () => {
    const out = sanitizeRepository({
      repository: ' s3:https://h/b/p ',
      env: {
        AWS_ACCESS_KEY_ID: 'a',
        RESTIC_PASSWORD: 'theirs',
        RESTIC_REPOSITORY: 'elsewhere',
        PATH: '/evil',
        HOME: '/evil',
        'bad name': 'x',
        lower: 'x',
      },
      options: { 's3.region': 'eu', 'bad option!': 'x' },
    })
    expect(out).toEqual({
      repository: 's3:https://h/b/p',
      env: { AWS_ACCESS_KEY_ID: 'a' },
      options: { 's3.region': 'eu' },
    })
  })

  it('refuses an empty repository', () => {
    expect(() => sanitizeRepository({ repository: ' ', env: {} })).toThrow()
  })
})

describe('describeRepository', () => {
  it('strips anything secret from an s3 address and leaves a path alone', () => {
    expect(
      describeRepository({ repository: 's3:https://u:p@host/bucket/prefix?x=1', env: {} })
    ).toBe('s3:https://host/bucket/prefix')
    expect(describeRepository({ repository: '/app/data/backups/org1', env: {} })).toBe(
      '/app/data/backups/org1'
    )
  })
})
