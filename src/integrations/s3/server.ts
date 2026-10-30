import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { ResticRepository } from '@/features/integrations/Lib/backup-types'
import type {
  ConnectorContext,
  ConnectorServer,
  PreviewTestResult,
  SettingOption,
} from '@/features/integrations/Lib/types'
import { describeRepository, forgetRepositoryCache, testBackupTarget } from '@/lib/backup/target'
import { isCloudInstance } from '@/lib/cloud-instance'
import { manifest } from './manifest'

/**
 * Turns the saved settings into a restic repository address.
 *
 * Every piece of the address is checked against a strict shape before it is
 * put into a URL, so a region or bucket can never carry a slash, a dot pair
 * or a host of its own into the endpoint. The vendor patterns are fixed; only
 * the self-hosted "other" provider takes an address the workshop typed.
 */

export type S3Provider = 'aws' | 'r2' | 'b2' | 'wasabi' | 'hetzner' | 'other'

const PROVIDERS: readonly S3Provider[] = ['aws', 'r2', 'b2', 'wasabi', 'hetzner', 'other']

const REGION = /^[a-z0-9]+(-[a-z0-9]+)*$/
const R2_ACCOUNT = /^[a-f0-9]{32}$/
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
const PREFIX = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*\/?)*[A-Za-z0-9]$|^[A-Za-z0-9]$/

export const PROVIDER_NAMES: Record<S3Provider, string> = {
  aws: 'Amazon S3',
  r2: 'Cloudflare R2',
  b2: 'Backblaze B2',
  wasabi: 'Wasabi',
  hetzner: 'Hetzner Object Storage',
  other: 'S3-compatible',
}

export class S3SettingsError extends Error {
  field: string
  constructor(field: string, message: string) {
    super(message)
    this.field = field
  }
}

function text(settings: Record<string, unknown>, key: string): string {
  const v = settings[key]
  return typeof v === 'string' ? v.trim() : ''
}

function region(settings: Record<string, unknown>, required: boolean): string {
  const value = text(settings, 'region').toLowerCase()
  if (!value) {
    if (required) throw new S3SettingsError('region', 'A region is required for this provider.')
    return ''
  }
  if (value.length > 32 || !REGION.test(value)) {
    throw new S3SettingsError('region', 'The region can only contain letters, digits and dashes.')
  }
  return value
}

/**
 * The host for a provider, from the fixed pattern. Exported for the tests
 * that prove a typed value cannot escape the pattern.
 */
export function endpointHost(
  provider: S3Provider,
  settings: Record<string, unknown>,
  typedEndpoint: string | undefined,
  cloud: boolean
): { host: string; region: string } {
  switch (provider) {
    case 'aws': {
      const r = region(settings, true)
      return { host: `s3.${r}.amazonaws.com`, region: r }
    }
    case 'r2': {
      const account = text(settings, 'accountId').toLowerCase()
      if (!R2_ACCOUNT.test(account)) {
        throw new S3SettingsError('accountId', 'The Cloudflare account id is 32 hex characters.')
      }
      return { host: `${account}.r2.cloudflarestorage.com`, region: 'auto' }
    }
    case 'b2': {
      const r = region(settings, true)
      return { host: `s3.${r}.backblazeb2.com`, region: r }
    }
    case 'wasabi': {
      const r = region(settings, true)
      return { host: `s3.${r}.wasabisys.com`, region: r }
    }
    case 'hetzner': {
      const r = region(settings, true)
      return { host: `${r}.your-objectstorage.com`, region: r }
    }
    case 'other': {
      // The registry drops this option on the cloud instance; this is the
      // second lock on the same door, for a row written before that rule.
      if (cloud) throw new S3SettingsError('provider', 'Custom endpoints are not available here.')
      const raw = (typedEndpoint ?? '').trim()
      if (!raw) throw new S3SettingsError('endpoint', 'An endpoint is required for this provider.')
      let url: URL
      try {
        url = new URL(raw.includes('://') ? raw : `https://${raw}`)
      } catch {
        throw new S3SettingsError('endpoint', 'The endpoint is not a valid address.')
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new S3SettingsError('endpoint', 'The endpoint must start with https:// or http://.')
      }
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new S3SettingsError(
          'endpoint',
          'Give the endpoint as a host name, with a port if needed.'
        )
      }
      const scheme = url.protocol === 'http:' ? 'http://' : ''
      return { host: `${scheme}${url.host}`, region: region(settings, false) }
    }
    default:
      throw new S3SettingsError('provider', 'Choose a storage provider.')
  }
}

export function repositoryFor(
  settings: Record<string, unknown>,
  credentials: Record<string, unknown>,
  cloud: boolean
): ResticRepository {
  const provider = text(settings, 'provider') as S3Provider
  if (!PROVIDERS.includes(provider))
    throw new S3SettingsError('provider', 'Choose a storage provider.')
  const bucket = text(settings, 'bucket').toLowerCase()
  if (!BUCKET.test(bucket) || bucket.includes('--')) {
    throw new S3SettingsError(
      'bucket',
      'The bucket name can only contain lowercase letters, digits and single dashes.'
    )
  }
  const prefix = text(settings, 'prefix') || 'torqvoice'
  if (
    prefix.length > 128 ||
    prefix.includes('..') ||
    prefix.includes('//') ||
    !PREFIX.test(prefix)
  ) {
    throw new S3SettingsError(
      'prefix',
      'The folder can only contain letters, digits, dots, dashes and slashes.'
    )
  }
  const accessKeyId =
    typeof credentials.accessKeyId === 'string' ? credentials.accessKeyId.trim() : ''
  const secretAccessKey =
    typeof credentials.secretAccessKey === 'string' ? credentials.secretAccessKey.trim() : ''
  if (!accessKeyId || !secretAccessKey) {
    throw new S3SettingsError(
      'accessKeyId',
      'The access key id and secret access key are required.'
    )
  }
  const typedEndpoint = typeof credentials.endpoint === 'string' ? credentials.endpoint : undefined
  const { host, region: r } = endpointHost(provider, settings, typedEndpoint, cloud)
  // restic's s3 backend: s3:https://host/bucket/prefix (path style, which
  // every vendor above accepts). A plain host is https; "http://" is only
  // reachable through a self-hosted custom endpoint.
  const base = host.startsWith('http://') ? host : `https://${host}`
  return {
    repository: `s3:${base}/${bucket}/${prefix}`,
    env: { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey },
    options: r ? { 's3.region': r } : undefined,
  }
}

async function repository(ctx: ConnectorContext): Promise<ResticRepository> {
  return repositoryFor(ctx.connection.settings, ctx.credentials, isCloudInstance())
}

/**
 * The buckets the key can see at the chosen provider, for the bucket picker.
 * Anything short of a list is an empty list: a provider without its region
 * yet, a key that may use one bucket but not list them, a vendor that is
 * down. The form then takes a typed name, and the connect step is where a
 * wrong key is told about.
 */
export async function listBuckets(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>,
  cloud: boolean
): Promise<SettingOption[]> {
  const provider = text(settings, 'provider') as S3Provider
  if (!PROVIDERS.includes(provider)) return []
  const accessKeyId =
    typeof credentials.accessKeyId === 'string' ? credentials.accessKeyId.trim() : ''
  const secretAccessKey =
    typeof credentials.secretAccessKey === 'string' ? credentials.secretAccessKey.trim() : ''
  if (!accessKeyId || !secretAccessKey) return []
  let host: string
  let region: string
  try {
    const typedEndpoint =
      typeof credentials.endpoint === 'string' ? credentials.endpoint : undefined
    ;({ host, region } = endpointHost(provider, settings, typedEndpoint, cloud))
  } catch {
    return []
  }
  const client = new S3Client({
    region: region || 'us-east-1',
    endpoint: host.startsWith('http://') ? host : `https://${host}`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  try {
    const out = await client.send(new ListBucketsCommand({}), {
      abortSignal: AbortSignal.timeout(10_000),
    })
    return (out.Buckets ?? [])
      .map((b) => b.Name)
      .filter((name): name is string => Boolean(name))
      .sort()
      .map((name) => ({ value: name, label: name }))
  } catch {
    return []
  } finally {
    client.destroy()
  }
}

function failed(step: string, err: unknown): PreviewTestResult {
  const e = err as { name?: string; message?: string }
  const reason = [e?.name, e?.message].filter((s) => typeof s === 'string' && s).join(': ')
  return { ok: false, step, reason: reason || String(err) }
}

/**
 * Proves the typed keys can do what a backup needs in the bucket, list,
 * write and delete, with one test object under the backup folder that is
 * removed again. It never touches the repository, so it can run before
 * anything is saved and says which permission is missing when one is.
 */
export async function testAccess(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>,
  cloud: boolean
): Promise<PreviewTestResult> {
  let repo: ResticRepository
  try {
    repo = repositoryFor(settings, credentials, cloud)
  } catch (err) {
    return { ok: false, step: 'settings', reason: err instanceof Error ? err.message : String(err) }
  }
  // s3:https://host/bucket/prefix, as repositoryFor builds it.
  const url = new URL(repo.repository.slice('s3:'.length))
  const [bucket, ...rest] = url.pathname.slice(1).split('/')
  const prefix = rest.join('/')
  const client = new S3Client({
    region: repo.options?.['s3.region'] || 'us-east-1',
    endpoint: url.origin,
    forcePathStyle: true,
    credentials: {
      accessKeyId: repo.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: repo.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  })
  const key = `${prefix}/.torqvoice-test-${randomUUID()}`
  const abortSignal = AbortSignal.timeout(15_000)
  try {
    try {
      await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/`, MaxKeys: 1 }),
        { abortSignal }
      )
    } catch (err) {
      return failed('list', err)
    }
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'torqvoice' }), {
        abortSignal,
      })
    } catch (err) {
      return failed('write', err)
    }
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal })
    } catch (err) {
      return failed('delete', err)
    }
    return { ok: true }
  } finally {
    client.destroy()
  }
}

export const connector: ConnectorServer = {
  manifest,
  async identify(ctx) {
    const provider = text(ctx.connection.settings, 'provider') as S3Provider
    const bucket = text(ctx.connection.settings, 'bucket')
    const prefix = text(ctx.connection.settings, 'prefix') || 'torqvoice'
    return {
      id: describeRepository(await repository(ctx)),
      name: `${bucket}/${prefix} on ${PROVIDER_NAMES[provider] ?? 'S3'}`,
    }
  },
  async test(ctx) {
    return testBackupTarget(ctx, repository)
  },
  async onDisconnect(ctx) {
    await forgetRepositoryCache(ctx.connection.organizationId)
  },
  remoteOptions: {
    buckets: (ctx) => listBuckets(ctx.credentials, ctx.connection.settings, isCloudInstance()),
  },
  previewOptions: {
    buckets: ({ credentials, settings }) => listBuckets(credentials, settings, isCloudInstance()),
  },
  previewTest: ({ credentials, settings }) => testAccess(credentials, settings, isCloudInstance()),
  jobs: {},
  backupTarget: { repository },
}
