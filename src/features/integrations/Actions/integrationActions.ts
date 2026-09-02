'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { FeatureGatedError, getFeatures, isCloudMode } from '@/lib/features'
import { demoGuard } from '@/lib/demo'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getManifest, listManifests } from '@/integrations/registry'
import { clearPulledEvents } from '../Lib/calendar-sync'
import {
  appUrl as configuredAppUrl,
  effectiveSettings,
  loadConnection,
  setConnectionStatus,
  storeCredentials,
  writeLog,
} from '../Lib/connections'
import { enqueueJob, runJob } from '../Lib/jobs'
import { oauthSpec, platformClient, redirectUriFor } from '../Lib/oauth'
import type { ConnectionStatus, ConnectorManifest, SettingOption } from '../Lib/types'
import { openCredentials } from '../Lib/vault'

const SETTINGS_PERMISSION = [
  { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
]
const READ_PERMISSION = [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }]

export interface CatalogEntry {
  manifest: ConnectorManifest
  status: ConnectionStatus | null
  externalAccountName: string | null
  lastError: string | null
  /** Whether this install can start an OAuth flow without the workshop's own app. */
  platformApp: boolean
  featured: boolean
}

function manifestForClient(m: ConnectorManifest): ConnectorManifest {
  // Manifests are plain data already; this documents the boundary.
  return m
}

export async function getIntegrationCatalog() {
  return withAuth(
    async ({ organizationId }) => {
      const [features, connections, countrySetting] = await Promise.all([
        getFeatures(organizationId),
        db.integrationConnection.findMany({
          where: { organizationId },
          select: { connectorId: true, status: true, externalAccountName: true, lastError: true },
        }),
        db.appSetting.findUnique({
          where: {
            organizationId_key: { organizationId, key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE },
          },
          select: { value: true },
        }),
      ])
      const byId = new Map(connections.map((c) => [c.connectorId, c]))
      const country = countrySetting?.value ?? null
      const entries: CatalogEntry[] = listManifests().map((manifest) => {
        const c = byId.get(manifest.id)
        const spec = oauthSpec(manifest)
        return {
          manifest: manifestForClient(manifest),
          status: (c?.status as ConnectionStatus | undefined) ?? null,
          externalAccountName: c?.externalAccountName ?? null,
          lastError: c?.lastError ?? null,
          platformApp: spec ? Boolean(platformClient(spec)) : true,
          featured:
            manifest.countries === 'global' ||
            (country ? manifest.countries.includes(country) : false),
        }
      })
      return {
        entries,
        enabled: features.integrations,
        isCloud: isCloudMode(),
      }
    },
    { requiredPermissions: READ_PERMISSION }
  )
}

export interface ConnectionView {
  manifest: ConnectorManifest
  connection: {
    id: string
    status: ConnectionStatus
    externalAccountName: string | null
    externalAccountId: string | null
    settings: Record<string, unknown>
    lastHealthAt: string | null
    lastSyncAt: string | null
    lastError: string | null
    createdAt: string
    /** Tenant-owned OAuth client id, when the workshop entered one. */
    tenantClientId: string | null
  } | null
  platformApp: boolean
  enabled: boolean
  isCloud: boolean
  webhookUrl: string | null
  /**
   * The callback the OAuth start route will send to the vendor. Computed on
   * the server from the configured app URL, so it is the same on the server
   * render and in the browser, and it matches what the vendor sees.
   */
  redirectUri: string
}

export async function getIntegrationConnection(connectorId: string) {
  return withAuth(
    async ({ organizationId }): Promise<ConnectionView> => {
      const manifest = getManifest(connectorId)
      if (!manifest) throw new Error('Unknown integration')
      const [features, row] = await Promise.all([
        getFeatures(organizationId),
        db.integrationConnection.findUnique({
          where: { organizationId_connectorId: { organizationId, connectorId } },
        }),
      ])
      const spec = oauthSpec(manifest)
      let tenantClientId: string | null = null
      if (row && spec?.tenantFields) {
        const creds = openCredentials(row.credentials)
        tenantClientId = typeof creds.clientId === 'string' ? creds.clientId : null
      }
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
      return {
        manifest: manifestForClient(manifest),
        connection: row
          ? {
              id: row.id,
              status: row.status as ConnectionStatus,
              externalAccountName: row.externalAccountName,
              externalAccountId: row.externalAccountId,
              settings: effectiveSettings(
                connectorId,
                (row.settings as Record<string, unknown>) ?? {}
              ),
              lastHealthAt: row.lastHealthAt?.toISOString() ?? null,
              lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
              lastError: row.lastError,
              createdAt: row.createdAt.toISOString(),
              tenantClientId,
            }
          : null,
        platformApp: spec ? Boolean(platformClient(spec)) : true,
        enabled: features.integrations && (!manifest.plan || Boolean(features[manifest.plan])),
        isCloud: isCloudMode(),
        webhookUrl:
          row && appUrl ? `${appUrl}/api/integrations/${connectorId}/${row.id}/webhook` : null,
        redirectUri: redirectUriFor(configuredAppUrl(), connectorId),
      }
    },
    { requiredPermissions: READ_PERMISSION }
  )
}

const credentialsSchema = z.record(z.string(), z.string().max(4000))

/**
 * Store credentials the workshop typed in: API keys, client-credential
 * keys, or its own OAuth client id and secret ahead of the handshake.
 */
export async function saveIntegrationCredentials(connectorId: string, raw: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const manifest = getManifest(connectorId)
      if (!manifest) throw new Error('Unknown integration')
      const features = await getFeatures(organizationId)
      if (!features.integrations)
        throw new FeatureGatedError('integrations', 'Integrations are not included in your plan.')
      const input = credentialsSchema.parse(raw)

      const fields =
        manifest.auth.type === 'oauth2' ? (manifest.auth.tenantFields ?? []) : manifest.auth.fields
      for (const f of fields) {
        if (f.required && !input[f.key]?.trim()) throw new Error(`${f.key} is required`)
      }
      const allowed = new Set(fields.map((f) => f.key))
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(input))
        if (allowed.has(k) && v.trim()) clean[k] = v.trim()

      const existing = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
      })
      const previous = openCredentials(existing?.credentials)
      // For OAuth the handshake still has to run; for keys the connection is live now.
      const status = manifest.auth.type === 'oauth2' ? (existing?.status ?? 'pending') : 'active'
      const connection = await db.integrationConnection.upsert({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        create: { organizationId, connectorId, status, createdById: userId },
        update: { status },
        select: { id: true },
      })
      await storeCredentials(connection.id, { ...previous, ...clean })

      if (manifest.auth.type !== 'oauth2') {
        const { ctx, server } = await loadConnection(connection.id)
        const result = await server.test(ctx)
        if (!result.ok) {
          await setConnectionStatus(
            connection.id,
            'error',
            result.message ?? 'Connection test failed'
          )
          throw new Error(result.message ?? 'Connection test failed')
        }
        if (server.identify) {
          const who = await server.identify(ctx)
          await db.integrationConnection.update({
            where: { id: connection.id },
            data: { externalAccountId: who.id, externalAccountName: who.name },
          })
        }
        await setConnectionStatus(connection.id, 'active')
      }
      revalidatePath(`/settings/integrations/${connectorId}`)
      return { id: connection.id }
    },
    {
      requiredPermissions: SETTINGS_PERMISSION,
      audit: ({ result }) => ({
        action: 'integration.connect',
        entity: 'IntegrationConnection',
        entityId: result.id,
        details: {
          key: 'integration_connect',
          params: { name: getManifest(connectorId)?.name ?? connectorId },
        },
      }),
    }
  )
}

const settingsSchema = z.record(
  z.string(),
  z.union([z.string().max(2000), z.number(), z.boolean()])
)

export async function updateIntegrationSettings(connectorId: string, raw: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const manifest = getManifest(connectorId)
      if (!manifest) throw new Error('Unknown integration')
      const input = settingsSchema.parse(raw)
      const clean: Record<string, unknown> = {}
      for (const field of manifest.settings) {
        if (!(field.key in input)) continue
        const v = input[field.key]
        if (field.type === 'boolean') clean[field.key] = Boolean(v)
        else if (field.type === 'number') clean[field.key] = Number(v)
        else clean[field.key] = String(v)
      }
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, settings: true, status: true },
      })
      if (!row) throw new Error('Connect the integration first')
      const settings = { ...((row.settings as Record<string, unknown>) ?? {}), ...clean }
      await db.integrationConnection.update({
        where: { id: row.id },
        data: { settings: settings as object },
      })
      await writeLog(row.id, 'info', 'Settings updated', { keys: Object.keys(clean) })
      revalidatePath(`/settings/integrations/${connectorId}`)
      return { settings }
    },
    { requiredPermissions: SETTINGS_PERMISSION }
  )
}

export async function getIntegrationRemoteOptions(connectorId: string, source: string) {
  return withAuth(
    async ({ organizationId }): Promise<SettingOption[]> => {
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row || row.status === 'pending' || row.status === 'disconnected') return []
      const { ctx, server } = await loadConnection(row.id)
      const provider = server.remoteOptions?.[source]
      if (!provider) return []
      return provider(ctx)
    },
    { requiredPermissions: READ_PERMISSION }
  )
}

export async function testIntegration(connectorId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true },
      })
      if (!row) throw new Error('Connect the integration first')
      const { ctx, server } = await loadConnection(row.id)
      try {
        const result = await server.test(ctx)
        await setConnectionStatus(
          row.id,
          result.ok ? 'active' : 'error',
          result.ok ? null : (result.message ?? 'Test failed')
        )
        await writeLog(
          row.id,
          result.ok ? 'info' : 'error',
          result.ok ? 'Connection test passed' : `Connection test failed: ${result.message ?? ''}`
        )
        revalidatePath(`/settings/integrations/${connectorId}`)
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Test failed'
        await setConnectionStatus(row.id, 'error', message)
        await writeLog(row.id, 'error', `Connection test failed: ${message}`)
        revalidatePath(`/settings/integrations/${connectorId}`)
        return { ok: false, message }
      }
    },
    { requiredPermissions: SETTINGS_PERMISSION }
  )
}

/** Queue one of the connector's jobs now, for example a full calendar pull. */
export async function runIntegrationJob(connectorId: string, kind: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const manifest = getManifest(connectorId)
      if (!manifest) throw new Error('Unknown integration')
      const known = new Set([
        ...(manifest.schedules ?? []).map((s) => s.job),
        ...(manifest.subscriptions ?? []).map((s) => s.job),
      ])
      if (!known.has(kind)) throw new Error('Unknown job')
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row || row.status === 'pending' || row.status === 'disconnected')
        throw new Error('Connect the integration first')
      const id = await enqueueJob({
        connectionId: row.id,
        organizationId,
        kind,
        idempotencyKey: `manual:${kind}`,
      })
      return { jobId: id }
    },
    { requiredPermissions: SETTINGS_PERMISSION }
  )
}

/** Push every scheduled work order in the window, for a fresh connection. */
export async function backfillIntegrationCalendar(connectorId: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row || row.status !== 'active') throw new Error('Connect the integration first')
      const from = new Date(Date.now() - 7 * 86_400_000)
      const records = await db.serviceRecord.findMany({
        where: { organizationId, startDateTime: { gte: from } },
        select: { id: true },
        take: 500,
      })
      for (const r of records) {
        await enqueueJob({
          connectionId: row.id,
          organizationId,
          kind: 'calendar.push',
          payload: { entityId: r.id, event: 'backfill' },
          idempotencyKey: `calendar.push:${r.id}`,
        })
      }
      await writeLog(row.id, 'info', `Queued ${records.length} work orders for push`)
      return { queued: records.length }
    },
    { requiredPermissions: SETTINGS_PERMISSION }
  )
}

export async function disconnectIntegration(connectorId: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row) throw new Error('Not connected')
      if (row.status === 'active' || row.status === 'error') {
        try {
          const { ctx, server } = await loadConnection(row.id)
          await server.onDisconnect?.(ctx)
        } catch (err) {
          console.warn('[integrations] onDisconnect failed:', err)
        }
      }
      // Tokens go; links and logs go with the row so nothing dangles.
      await db.integrationConnection.delete({ where: { id: row.id } })
      await clearPulledEvents(row.id)
      revalidatePath(`/settings/integrations/${connectorId}`)
      revalidatePath('/settings/integrations')
      revalidatePath('/calendar')
      return { id: row.id }
    },
    {
      requiredPermissions: SETTINGS_PERMISSION,
      audit: ({ result }) => ({
        action: 'integration.disconnect',
        entity: 'IntegrationConnection',
        entityId: result.id,
        details: {
          key: 'integration_disconnect',
          params: { name: getManifest(connectorId)?.name ?? connectorId },
        },
      }),
    }
  )
}

export async function getIntegrationActivity(connectorId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true },
      })
      if (!row) return { jobs: [], logs: [] }
      const [jobs, logs] = await Promise.all([
        db.integrationJob.findMany({
          where: { connectionId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            kind: true,
            status: true,
            attempts: true,
            error: true,
            runAfter: true,
            finishedAt: true,
            createdAt: true,
          },
        }),
        db.integrationLog.findMany({
          where: { connectionId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, level: true, message: true, createdAt: true },
        }),
      ])
      return {
        jobs: jobs.map((j) => ({
          ...j,
          runAfter: j.runAfter.toISOString(),
          finishedAt: j.finishedAt?.toISOString() ?? null,
          createdAt: j.createdAt.toISOString(),
        })),
        logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      }
    },
    { requiredPermissions: READ_PERMISSION }
  )
}

export async function retryIntegrationJob(jobId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const r = await db.integrationJob.updateMany({
        where: { id: jobId, organizationId, status: { in: ['dead', 'failed'] } },
        data: {
          status: 'queued',
          runAfter: new Date(),
          attempts: 0,
          error: null,
          finishedAt: null,
        },
      })
      return { retried: r.count }
    },
    { requiredPermissions: SETTINGS_PERMISSION }
  )
}

const SERVICE_PERMISSION = [
  { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
]

export interface ServiceVideoCall {
  /** The link on the work order, from whichever connection put it there. */
  link: {
    url: string
    /** Provider key for the label: zoom, google-meet, teams. */
    provider: string
    connectorId: string
    /** True when a person added it from the work order rather than a calendar rule. */
    manual: boolean
    /** True when it can be removed from the work order: the connector owns the meeting. */
    removable: boolean
  } | null
  /** Connected video call services a meeting can be added from. */
  providers: { connectorId: string; name: string }[]
}

/**
 * Video call state for one work order: the link a connection attached, and
 * the connected conferencing services that could add one. Calendar
 * connectors attach links as part of their event (Google Meet, Teams); a
 * conferencing connector such as Zoom owns the meeting outright, which is
 * the only kind a person can add or remove from the work order.
 */
export async function getServiceVideoCall(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }): Promise<ServiceVideoCall> => {
      const [links, connections] = await Promise.all([
        db.integrationLink.findMany({
          where: {
            entityType: 'ServiceRecord',
            entityId: serviceRecordId,
            connection: { organizationId, status: { in: ['active', 'error'] } },
          },
          select: { metadata: true, connection: { select: { connectorId: true } } },
        }),
        db.integrationConnection.findMany({
          where: { organizationId, status: 'active' },
          select: { connectorId: true },
        }),
      ])
      let link: ServiceVideoCall['link'] = null
      for (const l of links) {
        const meta = (l.metadata as Record<string, unknown> | null) ?? {}
        if (typeof meta.meetingUrl !== 'string') continue
        const manifest = getManifest(l.connection.connectorId)
        link = {
          url: meta.meetingUrl,
          provider: String(meta.meetingProvider ?? l.connection.connectorId),
          connectorId: l.connection.connectorId,
          manual: meta.manual === true,
          removable: manifest?.category === 'conferencing',
        }
        break
      }
      const providers = connections
        .map((c) => getManifest(c.connectorId))
        .filter((m): m is ConnectorManifest => Boolean(m && m.category === 'conferencing'))
        .map((m) => ({ connectorId: m.id, name: m.name }))
      return { link, providers }
    },
    { requiredPermissions: READ_PERMISSION }
  )
}

/**
 * Run a conferencing connector's sync for one work order right now, rather
 * than within the minute the cron would take, and report what it left
 * behind. The job still goes through the queue so it is logged, retried and
 * visible on the integration page like any other.
 */
async function syncServiceConference(
  organizationId: string,
  connectorId: string,
  serviceRecordId: string,
  action: 'create' | 'remove'
) {
  const manifest = getManifest(connectorId)
  if (!manifest || manifest.category !== 'conferencing') throw new Error('Unknown integration')
  const job = manifest.subscriptions?.find((s) => s.event === 'service.update')?.job
  if (!job) throw new Error('This integration cannot add video calls')
  const row = await db.integrationConnection.findUnique({
    where: { organizationId_connectorId: { organizationId, connectorId } },
    select: { id: true, status: true },
  })
  if (!row || row.status !== 'active') throw new Error('Connect the integration first')
  const record = await db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId },
    select: { id: true, startDateTime: true },
  })
  if (!record) throw new Error('Work order not found')
  if (action === 'create' && !record.startDateTime)
    throw new Error('Set a start time on the work order first')

  const jobId = await enqueueJob({
    connectionId: row.id,
    organizationId,
    kind: job,
    payload: { entityId: serviceRecordId, event: 'manual', action },
    idempotencyKey: `${job}:${serviceRecordId}`,
  })
  if (jobId) await runJob(jobId)

  const link = await db.integrationLink.findUnique({
    where: {
      connectionId_entityType_entityId: {
        connectionId: row.id,
        entityType: 'ServiceRecord',
        entityId: serviceRecordId,
      },
    },
    select: { metadata: true },
  })
  const meta = (link?.metadata as Record<string, unknown> | null) ?? {}
  const url = typeof meta.meetingUrl === 'string' ? meta.meetingUrl : null
  if ((action === 'create') !== Boolean(url)) {
    const failed = jobId
      ? await db.integrationJob.findUnique({ where: { id: jobId }, select: { error: true } })
      : null
    throw new Error(failed?.error ?? 'The video call service did not respond')
  }
  revalidatePath(`/settings/integrations/${connectorId}`)
  return { url }
}

/** Add a video call to a work order from the work order page. */
export async function createServiceMeeting(serviceRecordId: string, connectorId: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      return syncServiceConference(organizationId, connectorId, serviceRecordId, 'create')
    },
    { requiredPermissions: SERVICE_PERMISSION }
  )
}

/** Delete the work order's meeting at the provider and drop the link. */
export async function removeServiceMeeting(serviceRecordId: string, connectorId: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      return syncServiceConference(organizationId, connectorId, serviceRecordId, 'remove')
    },
    { requiredPermissions: SERVICE_PERMISSION }
  )
}

/** Whether the sidebar should flag an integration problem. */
export async function hasIntegrationErrors() {
  return withAuth(async ({ organizationId }) => {
    const count = await db.integrationConnection.count({
      where: { organizationId, status: 'error' },
    })
    return count > 0
  })
}
