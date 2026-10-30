import {
  BACKUP_CAPABILITY,
  BACKUP_PASSWORD_FIELD,
  BACKUP_SETTINGS,
} from '@/features/integrations/Lib/backup'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * S3-compatible object storage as a backup destination: the workshop's own
 * bucket at AWS, Cloudflare R2, Backblaze B2, Wasabi or Hetzner, or any other
 * S3 endpoint on a self-hosted install.
 *
 * One provider choice builds the endpoint from a fixed pattern, so on the
 * cloud instance the server only ever connects to those vendors. "Other" is
 * the one option that takes a typed address, and it exists only self-hosted.
 */
export const manifest: ConnectorManifest = {
  id: 's3',
  name: 'S3-compatible storage',
  category: 'storage',
  countries: 'global',
  logo: '/images/integrations/s3.svg',
  docs: '/docs/integrations/s3',
  auth: {
    type: 'api-key',
    fields: [
      {
        key: 'accessKeyId',
        label: 'accessKeyId',
        type: 'text',
        required: true,
        help: 'accessKeyIdHelp',
      },
      { key: 'secretAccessKey', label: 'secretAccessKey', type: 'password', required: true },
      BACKUP_PASSWORD_FIELD,
      {
        key: 'endpoint',
        label: 'endpoint',
        type: 'url',
        help: 'endpointHelp',
        placeholder: 'https://minio.example.com:9000',
        advanced: true,
        selfHostedOnly: true,
      },
    ],
  },
  capabilities: [BACKUP_CAPABILITY],
  plan: 'backups',
  settings: [
    {
      key: 'provider',
      type: 'select',
      label: 'provider',
      required: true,
      default: 'aws',
      options: [
        { value: 'aws', label: 'providerAws' },
        { value: 'r2', label: 'providerR2' },
        { value: 'b2', label: 'providerB2' },
        { value: 'wasabi', label: 'providerWasabi' },
        { value: 'hetzner', label: 'providerHetzner' },
        { value: 'other', label: 'providerOther', selfHostedOnly: true },
      ],
    },
    { key: 'region', type: 'text', label: 'region', help: 'regionHelp' },
    {
      key: 'accountId',
      type: 'text',
      label: 'accountId',
      help: 'accountIdHelp',
      showWhen: { key: 'provider', equals: 'r2' },
    },
    { key: 'bucket', type: 'text', label: 'bucket', required: true },
    { key: 'prefix', type: 'text', label: 'prefix', help: 'prefixHelp', default: 'torqvoice' },
    ...BACKUP_SETTINGS,
  ],
}
