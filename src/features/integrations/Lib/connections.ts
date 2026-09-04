/**
 * Loading a connection into the context a connector runs with.
 *
 * Everything a job handler needs comes through here: the decrypted
 * credentials, an HTTP client bound to them, the link store, a logger that
 * writes to the connection's log, and the workshop's timezone. Nothing in a
 * connector touches Prisma directly.
 */

import { db } from '@/lib/db'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { getConnector, getManifest } from '@/integrations/registry'
import { createConnectorHttp } from './http'
import { oauthSpec } from './oauth'
import type { ConnectorContext, ConnectorServer, LinkRecord, LinkStore, LogLevel } from './types'
import { openCredentials, sealCredentials } from './vault'

export const DEFAULT_TIMEZONE = 'UTC'

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export async function organizationTimezone(organizationId: string): Promise<string> {
  return workshopTimeZone(organizationId)
}

export async function writeLog(
  connectionId: string,
  level: LogLevel,
  message: string,
  details?: Record<string, unknown>,
  jobId?: string | null
): Promise<void> {
  try {
    await db.integrationLog.create({
      data: {
        connectionId,
        jobId: jobId ?? null,
        level,
        message: message.slice(0, 500),
        details: details ? (JSON.parse(JSON.stringify(details)) as object) : undefined,
      },
    })
  } catch (err) {
    console.error('[integrations] log write failed:', err)
  }
}

function linkStore(connectionId: string): LinkStore {
  return {
    async get(entityType, entityId): Promise<LinkRecord | null> {
      const row = await db.integrationLink.findUnique({
        where: { connectionId_entityType_entityId: { connectionId, entityType, entityId } },
      })
      if (!row) return null
      return {
        remoteId: row.remoteId,
        remoteUrl: row.remoteUrl,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        checksum: row.checksum,
      }
    },
    async set(entityType, entityId, link) {
      const data = {
        remoteId: link.remoteId,
        remoteUrl: link.remoteUrl ?? null,
        metadata:
          link.metadata === undefined
            ? undefined
            : ((link.metadata ?? undefined) as object | undefined),
        checksum: link.checksum ?? null,
        lastSyncedAt: new Date(),
      }
      await db.integrationLink.upsert({
        where: { connectionId_entityType_entityId: { connectionId, entityType, entityId } },
        create: { connectionId, entityType, entityId, ...data },
        update: data,
      })
    },
    async remove(entityType, entityId) {
      await db.integrationLink.deleteMany({ where: { connectionId, entityType, entityId } })
    },
    async remoteIds(entityType) {
      const rows = await db.integrationLink.findMany({
        where: { connectionId, entityType },
        select: { remoteId: true },
      })
      return new Set(rows.map((r) => r.remoteId))
    },
    async byRemoteId(entityType, remoteId) {
      const row = await db.integrationLink.findFirst({
        where: { connectionId, entityType, remoteId },
      })
      if (!row) return null
      return {
        entityId: row.entityId,
        remoteId: row.remoteId,
        remoteUrl: row.remoteUrl,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        checksum: row.checksum,
      }
    },
  }
}

export interface LoadedConnection {
  ctx: ConnectorContext
  server: ConnectorServer
  status: string
}

/**
 * Build the runtime context for a connection. Throws when the connection or
 * its connector no longer exists; callers decide whether that is fatal.
 */
export async function loadConnection(
  connectionId: string,
  options: { jobId?: string | null } = {}
): Promise<LoadedConnection> {
  const row = await db.integrationConnection.findUnique({ where: { id: connectionId } })
  if (!row) throw new Error('Integration connection not found')
  const manifest = getManifest(row.connectorId)
  if (!manifest) throw new Error(`Unknown connector ${row.connectorId}`)
  const server = await getConnector(row.connectorId)
  const credentials = openCredentials(row.credentials)
  const log = (level: LogLevel, message: string, details?: Record<string, unknown>) =>
    writeLog(connectionId, level, message, details, options.jobId)

  const http = createConnectorHttp({
    connectionId,
    credentials,
    auth: oauthSpec(manifest) ? { oauth: oauthSpec(manifest) ?? undefined } : {},
    log,
  })

  const ctx: ConnectorContext = {
    connection: {
      id: row.id,
      organizationId: row.organizationId,
      connectorId: row.connectorId,
      settings: (row.settings as Record<string, unknown>) ?? {},
      state: (row.state as Record<string, unknown>) ?? {},
      externalAccountId: row.externalAccountId,
    },
    credentials,
    http,
    links: linkStore(connectionId),
    log,
    async saveState(patch) {
      const current = await db.integrationConnection.findUnique({
        where: { id: connectionId },
        select: { state: true },
      })
      const next = { ...((current?.state as Record<string, unknown>) ?? {}), ...patch }
      await db.integrationConnection.update({
        where: { id: connectionId },
        data: { state: next as object },
      })
      ctx.connection.state = next
    },
    timezone: await organizationTimezone(row.organizationId),
    appUrl: appUrl(),
  }
  return { ctx, server, status: row.status }
}

export async function setConnectionStatus(
  connectionId: string,
  status: 'active' | 'error' | 'disconnected',
  error?: string | null
): Promise<void> {
  await db.integrationConnection.update({
    where: { id: connectionId },
    data: {
      status,
      lastError: error === undefined ? undefined : error,
      ...(status === 'active' && { lastHealthAt: new Date(), lastError: null }),
    },
  })
}

export async function storeCredentials(
  connectionId: string,
  credentials: Record<string, unknown>
): Promise<void> {
  await db.integrationConnection.update({
    where: { id: connectionId },
    data: { credentials: sealCredentials(credentials) },
  })
}

/** Effective settings: manifest defaults under what the workshop saved. */
export function effectiveSettings(
  connectorId: string,
  saved: Record<string, unknown>
): Record<string, unknown> {
  const manifest = getManifest(connectorId)
  const out: Record<string, unknown> = {}
  for (const field of manifest?.settings ?? []) {
    if (field.default !== undefined) out[field.key] = field.default
  }
  return { ...out, ...saved }
}
