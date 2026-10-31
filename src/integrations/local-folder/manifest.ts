import {
  BACKUP_CAPABILITY,
  BACKUP_PASSWORD_FIELD,
  BACKUP_SETTINGS,
} from '@/features/integrations/Lib/backup'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * A folder on the server as a backup destination, for self-hosted installs:
 * the `backups` volume in the compose file, or a NAS mounted there. The
 * repository lives under BACKUP_LOCAL_ROOT (or `backups` under DATA_ROOT),
 * one folder per workshop, named after the workshop by default. Only that
 * folder name can be typed, never a path: changing it points a new install
 * (whose workshop has a new id) at the folder an earlier install wrote.
 *
 * Not on the cloud instance: our disk is not the workshop's storage, and a
 * copy on the same machine as the database is not a backup of it.
 */
export const manifest: ConnectorManifest = {
  id: 'local-folder',
  name: 'Local folder',
  category: 'storage',
  countries: 'global',
  logo: '/images/integrations/local-folder.svg',
  docs: '/docs/integrations/local-folder',
  testBeforeConnect: true,
  auth: { type: 'api-key', fields: [BACKUP_PASSWORD_FIELD] },
  capabilities: [BACKUP_CAPABILITY],
  plan: 'backups',
  selfHostedOnly: true,
  settings: [
    { key: 'folder', type: 'text', label: 'folder', help: 'folderHelp' },
    ...BACKUP_SETTINGS,
  ],
}
