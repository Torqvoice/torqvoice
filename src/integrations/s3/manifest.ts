import {
  BACKUP_CAPABILITY,
  BACKUP_PASSWORD_FIELD,
  BACKUP_SETTINGS,
} from '@/features/integrations/Lib/backup'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'
import { REGIONS_BY_PROVIDER } from './regions'

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
  name: 'Cloud storage bucket',
  category: 'storage',
  countries: 'global',
  logo: '/images/integrations/s3.svg',
  docs: '/docs/integrations/s3',
  // The provider decides the rest of the page: which region list, whether an
  // account id or an endpoint is asked for, which buckets can be listed.
  settingsFirst: true,
  testBeforeConnect: true,
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
        required: true,
        showWhen: { key: 'provider', equals: 'other' },
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
    {
      // A list for the vendors that have one, a text box for other storage,
      // nothing for Cloudflare R2, which has no regions.
      key: 'region',
      type: 'select',
      label: 'region',
      help: 'regionHelp',
      optionsBy: { key: 'provider', options: REGIONS_BY_PROVIDER },
      showWhen: { key: 'provider', in: ['aws', 'b2', 'wasabi', 'hetzner', 'other'] },
    },
    {
      key: 'accountId',
      type: 'text',
      label: 'accountId',
      help: 'accountIdHelp',
      showWhen: { key: 'provider', equals: 'r2' },
    },
    {
      // Listed from the keys as soon as they are typed; a key that may use
      // one bucket but not list them takes the name typed in.
      key: 'bucket',
      type: 'remote-select',
      source: 'buckets',
      label: 'bucket',
      help: 'bucketHelp',
      required: true,
      allowCustom: true,
      preview: {
        credentials: ['accessKeyId', 'secretAccessKey', 'endpoint'],
        settings: ['provider', 'region', 'accountId'],
      },
    },
    { key: 'prefix', type: 'text', label: 'prefix', help: 'prefixHelp', default: 'torqvoice' },
    ...BACKUP_SETTINGS,
  ],
}
