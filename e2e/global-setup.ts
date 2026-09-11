import { prepareDatabase } from './prepare-db'

/**
 * With the suite's own server, the database is prepared by the server command
 * before `next start`, so there is nothing to do here. Pointed at a server
 * somebody else started, this is the only chance to do it.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) prepareDatabase()
}
