'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Play,
  Plug,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Unplug,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { DocsLink } from '@/components/docs-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { BackupCard } from './backup-card'
import { OptionPicker } from './option-picker'
import { conditionMet } from '@/features/integrations/Lib/conditions'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/confirm-dialog'
import {
  backfillIntegrationAccounting,
  backfillIntegrationCalendar,
  type ConnectionView,
  disconnectIntegration,
  getIntegrationRemoteOptions,
  previewIntegrationRemoteOptions,
  previewIntegrationTest,
  retryIntegrationBatch,
  retryIntegrationJob,
  runIntegrationJob,
  saveIntegrationCredentials,
  sendIntegrationTestMessage,
  testIntegration,
  updateIntegrationSettings,
} from '@/features/integrations/Actions/integrationActions'
import type {
  ActivityItem,
  ActivityJob,
  CredentialField,
  PreviewTestResult,
  SettingField,
  SettingOption,
} from '@/features/integrations/Lib/types'
import { handleGated } from '@/components/upgrade-gate'

type Activity = {
  items: ActivityItem[]
  logs: { id: string; level: string; message: string; createdAt: string; details?: unknown }[]
}

export function ConnectionSettings({
  view,
  activity,
}: {
  view: ConnectionView
  activity: Activity
}) {
  const t = useTranslations('integrations')
  const tc = useTranslations(`integrations.connectors.${view.manifest.id}`)
  const format = useFormatter()
  const router = useRouter()
  const search = useSearchParams()
  const confirm = useConfirm()
  const { manifest, connection } = view
  const name = connectorName(t, manifest)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Outcome of an OAuth round trip lands here as a query parameter.
  useEffect(() => {
    const error = search.get('error')
    const connected = search.get('connected')
    if (connected) toast.success(t('connection.connected', { name }))
    if (error) toast.error(t.has(`errors.${error}`) ? t(`errors.${error}`) : t('errors.vendor'))
    if (error || connected) router.replace(`/settings/integrations/${manifest.id}`)
  }, [search, router, t, manifest])

  // A backfill runs fifty jobs a minute in the background; while any are
  // still pending the counts on the activity card follow along.
  const pending = activity.items.some((i) =>
    i.type === 'batch'
      ? i.counts.queued + i.counts.running > 0
      : i.status === 'queued' || i.status === 'running'
  )
  useEffect(() => {
    if (!pending) return
    const id = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(id)
  }, [pending, router])

  const isOAuth = manifest.auth.type === 'oauth2'
  // A connected service with a required setting still empty is not working,
  // whatever the vendor's status says; the calendar to write to is the usual
  // case. The page says so up top rather than leaving it to the job log.
  const savedSettings = initialSettingValues(manifest.settings, connection?.settings ?? {})
  const unfinishedSetup =
    connection?.status === 'active'
      ? visibleSettingFields(manifest.settings, savedSettings).filter((f) =>
          settingMissing(f, savedSettings)
        )
      : []
  const setupMissing = unfinishedSetup.length > 0
  const oauthNeedsTenantApp = isOAuth && !view.platformApp
  const connected = connection && (connection.status === 'active' || connection.status === 'error')
  const oauthStartUrl = `/api/integrations/${manifest.id}/oauth/start`

  const run = useCallback(
    async (
      key: string,
      fn: () => Promise<{ success: boolean; error?: string; data?: unknown } | void>,
      done?: string | ((data: unknown) => string)
    ) => {
      setBusy(key)
      try {
        const res = await fn()
        if (res && !res.success) {
          if (!handleGated(res)) toast.error(res.error || t('errors.generic'))
          return false
        }
        if (done) toast.success(typeof done === 'function' ? done(res?.data) : done)
        router.refresh()
        return true
      } finally {
        setBusy(null)
      }
    },
    [router, t]
  )

  const disconnect = async () => {
    const ok = await confirm({
      title: t('connection.disconnectTitle', { name }),
      // What a disconnect leaves behind differs by kind of service, and the
      // dialog is the one place people read before pressing it.
      description: t(
        manifest.category === 'calendar'
          ? 'connection.disconnectDescriptionCalendar'
          : manifest.category === 'conferencing'
            ? 'connection.disconnectDescriptionConferencing'
            : manifest.category === 'accounting'
              ? 'connection.disconnectDescriptionAccounting'
              : 'connection.disconnectDescription',
        { name }
      ),
      confirmLabel: t('connection.disconnect'),
      destructive: true,
    })
    if (!ok) return
    const done = await run(
      'disconnect',
      () => disconnectIntegration(manifest.id),
      t('connection.disconnected')
    )
    if (done) router.push('/settings/integrations')
  }

  // A row that never got past setup, or was disconnected and kept its
  // settings, still shows under "Connected" as in progress. Clearing the
  // fields cannot get rid of it, because the required ones refuse to be
  // empty; this can. The same action as disconnect, worded for a service
  // that was never actually connected.
  const removeSetup = async () => {
    const ok = await confirm({
      title: t('connection.removeSetupTitle', { name }),
      description: t('connection.removeSetupDescription', { name }),
      confirmLabel: t('connection.removeSetup'),
      destructive: true,
    })
    if (!ok) return
    const done = await run(
      'disconnect',
      () => disconnectIntegration(manifest.id),
      t('connection.removeSetupDone', { name })
    )
    if (done) router.push('/settings/integrations')
  }

  const firstSchedule = manifest.schedules?.[0]?.job
  const hasSync = Boolean(firstSchedule)
  // An inspection pass does nothing while its setting is off, so the button
  // waits for it rather than looking like it worked.
  const inspectionSyncOff =
    Boolean(view.inspectionSync) && connection?.settings.syncInspections !== true

  async function syncNow() {
    if (!firstSchedule) return
    // A registry pass looks up every vehicle that is due, and a paid
    // registry bills each one found, so it says how many before it starts.
    const sync = view.inspectionSync
    if (sync) {
      if (sync.dueForCheck === 0) {
        toast.info(t('connection.inspectionSync.nothingDue'))
        return
      }
      const ok = await confirm({
        title: t('connection.inspectionSync.confirmTitle'),
        description: t('connection.inspectionSync.confirmDescription', {
          count: sync.dueForCheck,
          total: sync.vehiclesWithPlate,
          name: name,
        }),
        confirmLabel: t('connection.inspectionSync.confirmLabel', { count: sync.dueForCheck }),
      })
      if (!ok) return
    }
    await run(
      'sync',
      () => runIntegrationJob(manifest.id, firstSchedule),
      isAccounting ? t('connection.pullQueued') : t('connection.syncQueued')
    )
  }
  const isCalendar = manifest.category === 'calendar'
  const isAccounting = manifest.category === 'accounting'
  // Mail vendors can prove themselves by delivering a message to the person
  // looking at the page, which a key check cannot.
  const canSendTestEmail = manifest.capabilities.includes('email.send')

  return (
    <div className="space-y-4">
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('connection.back')}
      </Link>

      <AppCard
        icon={Plug}
        title={
          <span className="flex items-center gap-3">
            <Image
              src={manifest.logo}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded"
              unoptimized
            />
            {name}
            {connection && <StatusBadge status={setupMissing ? 'needsSetup' : connection.status} />}
          </span>
        }
        description={tc('description')}
        action={<DocsLink href={manifest.docs} variant="hint" />}
      >
        <div className="mb-4 flex flex-wrap gap-1">
          {manifest.capabilities.map((cap) => (
            <Badge key={cap} variant="outline" className="text-[11px] font-normal">
              {t(`capabilities.${cap}`)}
            </Badge>
          ))}
        </div>

        {setupMissing && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{t('connection.setupMissingTitle')}</p>
              <p className="text-muted-foreground">
                {t('connection.setupMissing', {
                  fields: unfinishedSetup.map((f) => tc(`settings.${f.label}`)).join(', '),
                })}
              </p>
            </div>
          </div>
        )}
        {connection?.lastError && connection.status === 'error' && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t('connection.lastError')}</p>
              <p className="text-muted-foreground">{connection.lastError}</p>
            </div>
          </div>
        )}

        {connected && view.inspectionSync && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
            <p className="font-medium">{t('connection.inspectionSync.title')}</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>
                {t('connection.inspectionSync.vehicles', {
                  count: view.inspectionSync.vehiclesWithPlate,
                })}
              </li>
              <li>
                {t('connection.inspectionSync.dueNow', { count: view.inspectionSync.dueForCheck })}
              </li>
              <li>
                {t('connection.inspectionSync.withDate', { count: view.inspectionSync.withDate })}
              </li>
              <li>
                {view.inspectionSync.inProgress
                  ? t('connection.inspectionSync.inProgress')
                  : view.inspectionSync.lastPassAt
                    ? t('connection.inspectionSync.lastPass', {
                        date: format.dateTime(new Date(view.inspectionSync.lastPassAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                      })
                    : t('connection.inspectionSync.never')}
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {connection.settings.syncInspections === true
                ? t('connection.inspectionSync.syncNowHelp')
                : t('connection.inspectionSync.off')}
            </p>
          </div>
        )}

        {/* Only one AI provider, and one vendor per messaging channel, stays in
            charge. Connecting this one stands the other down, which is worth
            knowing before the button is pressed rather than after. */}
        {!connected && view.supersedes && (
          <div className="mb-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-muted-foreground">
              {t('connection.supersedes', {
                current: view.supersedes.name,
                next: name,
              })}
            </p>
          </div>
        )}

        {connected ? (
          <div className={`grid gap-4 text-sm ${hasSync ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <div>
              <p className="text-xs text-muted-foreground">{t('connection.account')}</p>
              <p className="font-medium">{connection.externalAccountName ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('connection.lastHealth')}</p>
              <p className="font-medium">
                {connection.lastHealthAt
                  ? format.dateTime(new Date(connection.lastHealthAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '-'}
              </p>
            </div>
            {/* Only connectors that sync on a timer have a last sync to show. */}
            {hasSync && (
              <div>
                <p className="text-xs text-muted-foreground">{t('connection.lastSync')}</p>
                <p className="font-medium">
                  {connection.lastSyncAt
                    ? format.dateTime(new Date(connection.lastSyncAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '-'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <ConnectForm
              manifest={manifest}
              tenantClientId={connection?.tenantClientId ?? null}
              needsTenantApp={oauthNeedsTenantApp}
              redirectUri={view.redirectUri}
              oauthStartUrl={oauthStartUrl}
              enabled={view.enabled}
              busy={busy}
              initialSettings={connection?.settings}
              onSave={(values, settings) =>
                run(
                  'credentials',
                  () => saveIntegrationCredentials(manifest.id, values, settings),
                  isOAuth ? undefined : t('connection.connectedShort')
                )
              }
            />
            {connection && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                <p className="text-muted-foreground">{t('connection.removeSetupHint')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={removeSetup}
                  disabled={busy !== null}
                >
                  {busy === 'disconnect' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  {t('connection.removeSetup')}
                </Button>
              </div>
            )}
          </>
        )}

        {connected && view.inbound && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{t('connection.inboundUrl')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`connection.${view.inbound.note}`)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="block min-w-0 flex-1 select-all break-all rounded bg-background px-2 py-1 text-xs">
                {view.inbound.url}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(view.inbound?.url ?? '')
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? (
                  <Check className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1 h-3.5 w-3.5" />
                )}
                {copied ? t('connection.copied') : t('connection.copy')}
              </Button>
            </div>
          </div>
        )}

        {/* Keys that failed their check can be entered again without
            disconnecting first, which would also throw the settings away. */}
        {connected && connection.status === 'error' && !isOAuth && (
          <div className="mt-4 rounded-lg border p-3">
            <p className="mb-3 text-sm">
              <span className="font-medium">{t('connection.updateKeys')}</span>{' '}
              <span className="text-muted-foreground">{t('connection.updateKeysHint')}</span>
            </p>
            <ConnectForm
              manifest={manifest}
              tenantClientId={null}
              needsTenantApp={false}
              redirectUri={view.redirectUri}
              oauthStartUrl={oauthStartUrl}
              enabled={view.enabled}
              busy={busy}
              initialSettings={connection.settings}
              onSave={(values, settings) =>
                run(
                  'credentials',
                  () => saveIntegrationCredentials(manifest.id, values, settings),
                  t('connection.connectedShort')
                )
              }
            />
          </div>
        )}

        {connected && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                run('test', () => testIntegration(manifest.id), t('connection.testPassed'))
              }
              disabled={busy !== null}
            >
              {busy === 'test' ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              {t('connection.test')}
            </Button>
            {canSendTestEmail && (
              <Button
                variant="outline"
                size="sm"
                title={t('connection.testEmailHint')}
                onClick={() =>
                  run('sendTest', async () => {
                    const res = await sendIntegrationTestMessage(manifest.id)
                    if (res.success && res.data) {
                      toast.success(t('connection.testEmailSent', { email: res.data.sentTo }))
                    }
                    return res
                  })
                }
                disabled={busy !== null}
              >
                {busy === 'sendTest' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="mr-1 h-3.5 w-3.5" />
                )}
                {t('connection.sendTestEmail')}
              </Button>
            )}
            {firstSchedule && (
              <Button
                variant="outline"
                size="sm"
                onClick={syncNow}
                disabled={busy !== null || setupMissing || inspectionSyncOff}
                title={inspectionSyncOff ? t('connection.inspectionSync.off') : undefined}
              >
                {busy === 'sync' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                {isAccounting ? t('connection.pullNow') : t('connection.syncNow')}
              </Button>
            )}
            {isCalendar && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    'backfill',
                    () => backfillIntegrationCalendar(manifest.id),
                    t('connection.backfillQueued')
                  )
                }
                disabled={busy !== null || setupMissing}
              >
                {busy === 'backfill' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3.5 w-3.5" />
                )}
                {t('connection.backfill')}
              </Button>
            )}
            {isAccounting && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    'backfill',
                    () => backfillIntegrationAccounting(manifest.id),
                    (data) => {
                      const n = (data as { queued?: number } | undefined)?.queued ?? 0
                      return n > 0
                        ? t('connection.backfillInvoicesQueuedCount', { count: n })
                        : t('connection.backfillInvoicesNone')
                    }
                  )
                }
                disabled={busy !== null || setupMissing}
              >
                {busy === 'backfill' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3.5 w-3.5" />
                )}
                {t('connection.backfillInvoices')}
              </Button>
            )}
            {isOAuth && (
              <Button variant="outline" size="sm" asChild>
                <a href={oauthStartUrl}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {t('connection.reconnect')}
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={disconnect}
              disabled={busy !== null}
            >
              <Unplug className="mr-1 h-3.5 w-3.5" />
              {t('connection.disconnect')}
            </Button>
          </div>
        )}
      </AppCard>

      {connected && view.backup && (
        <BackupCard connectorId={manifest.id} backup={view.backup} docs={manifest.docs} />
      )}

      {connected && manifest.settings.length > 0 && (
        <SettingsForm
          // A list can hang on a choice above it, the way a company's
          // accounts hang on the company. Once that choice is saved the form
          // starts over and reads the lists again.
          key={manifest.settings
            .filter((f) => f.type === 'remote-select' && f.required)
            .map((f) => String(connection.settings[f.key] ?? ''))
            .join('|')}
          connectorId={manifest.id}
          fields={manifest.settings}
          initial={connection.settings}
          onSave={(values) =>
            run(
              'settings',
              () => updateIntegrationSettings(manifest.id, values),
              t('connection.settingsSaved')
            )
          }
          busy={busy === 'settings'}
        />
      )}

      {connection && (activity.items.length > 0 || activity.logs.length > 0) && (
        <ActivityCard
          activity={activity}
          onRetry={(id) =>
            run(`retry:${id}`, () => retryIntegrationJob(id), t('connection.retryQueued'))
          }
          onRetryBatch={(batchId) =>
            run(
              `retry-batch:${batchId}`,
              () => retryIntegrationBatch(manifest.id, batchId),
              (data) =>
                t('connection.batchRetried', {
                  count: (data as { retried?: number } | undefined)?.retried ?? 0,
                })
            )
          }
          busy={busy}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('integrations.statuses')
  const cls =
    status === 'active'
      ? 'border-emerald-500/30 text-emerald-600'
      : status === 'error'
        ? 'border-destructive/30 text-destructive'
        : status === 'needsSetup'
          ? 'border-amber-500/40 text-amber-600'
          : 'text-muted-foreground'
  return (
    <Badge variant="outline" className={`text-[11px] font-normal ${cls}`}>
      {t(status)}
    </Badge>
  )
}

function ConnectForm({
  manifest,
  tenantClientId,
  needsTenantApp,
  redirectUri,
  oauthStartUrl,
  enabled,
  busy,
  initialSettings,
  onSave,
}: {
  manifest: ConnectionView['manifest']
  tenantClientId: string | null
  needsTenantApp: boolean
  redirectUri: string
  oauthStartUrl: string
  enabled: boolean
  busy: string | null
  /** Settings already on the connection, when keys are being entered again. */
  initialSettings?: Record<string, unknown>
  onSave: (values: Record<string, string>, settings?: SettingValues) => Promise<boolean>
}) {
  const t = useTranslations('integrations')
  const tc = useTranslations(`integrations.connectors.${manifest.id}`)
  const name = connectorName(t, manifest)
  const fields: CredentialField[] =
    manifest.auth.type === 'oauth2'
      ? needsTenantApp
        ? (manifest.auth.tenantFields ?? [])
        : []
      : manifest.auth.fields
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of fields) if (f.default) initial[f.key] = f.default
    if (tenantClientId) initial.clientId = tenantClientId
    return initial
  })
  // Key-based vendors take their settings on the same page as the keys: an
  // SMTP port means nothing without its TLS choice, and a from address is
  // needed before a test email can go out. Remote selects need a connection
  // to list from, so they wait for the settings card.
  // A remote select that can list from the typed keys (a storage key's
  // buckets) is the exception, read as the keys are typed.
  const settingFields: SettingField[] = useMemo(
    () =>
      manifest.auth.type === 'oauth2'
        ? []
        : manifest.settings.filter((f) => f.type !== 'remote-select' || f.preview),
    [manifest]
  )
  const [settings, setSettings] = useState<SettingValues>(() =>
    initialSettingValues(settingFields, initialSettings ?? {})
  )
  const visibleSettings = visibleSettingFields(settingFields, settings)
  const settingsMissing = visibleSettings.some((f) => settingMissing(f, settings))
  // A key that belongs to one provider choice is only asked for under it.
  const visibleFields = fields.filter((f) => conditionMet(f.showWhen, settings))

  const previewFields = useMemo(
    () => settingFields.filter((f) => f.type === 'remote-select' && f.preview && f.source),
    [settingFields]
  )
  // Nothing can be listed before the keys are typed, so the lists start out
  // as "not yet" rather than "loading".
  const [remote, setRemote] = useState<Record<string, SettingOption[] | null | undefined>>(() =>
    Object.fromEntries(previewFields.map((f) => [f.source as string, null]))
  )
  // What is typed right now, for the effect below to read without running on
  // every keystroke: a password being typed must not restart the listing.
  const typed = useRef({ values, settings })
  typed.current = { values, settings }
  // The typed values each list depends on, as one string: the list is read
  // again when any of them changes and left alone while anything else is typed.
  const previewKey = previewFields
    .map((f) =>
      [
        f.source,
        ...(f.preview?.credentials ?? []).map((k) => values[k] ?? ''),
        ...(f.preview?.settings ?? []).map((k) => String(settings[k] ?? '')),
      ].join('\u0000')
    )
    .join('\u0001')
  useEffect(() => {
    if (previewFields.length === 0) return
    let cancelled = false
    const timer = setTimeout(() => {
      const { values: typedValues, settings: typedSettings } = typed.current
      for (const f of previewFields) {
        const source = f.source as string
        const needed = (f.preview?.credentials ?? []).filter((k) =>
          fields.some((c) => c.key === k && c.required && conditionMet(c.showWhen, typedSettings))
        )
        if (needed.some((k) => !typedValues[k]?.trim())) {
          setRemote((r) => ({ ...r, [source]: null }))
          continue
        }
        setRemote((r) => ({ ...r, [source]: undefined }))
        const credentials = Object.fromEntries(
          (f.preview?.credentials ?? []).map((k) => [k, typedValues[k] ?? ''])
        )
        const picked = Object.fromEntries(
          (f.preview?.settings ?? []).map((k) => [k, typedSettings[k] ?? ''])
        )
        previewIntegrationRemoteOptions(manifest.id, source, credentials, picked).then((res) => {
          if (cancelled) return
          setRemote((r) => ({ ...r, [source]: res.success && res.data ? res.data : [] }))
        })
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewKey, previewFields, fields, manifest.id])
  const tenantReady = Boolean(tenantClientId)
  // A made-up secret, such as a backup password, is shown once it is
  // generated so it can be copied somewhere safe.
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [generated, setGenerated] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const tenantComplete = Boolean(values.clientId) && (Boolean(values.clientSecret) || tenantReady)
  const tenantDirty = values.clientId !== (tenantClientId ?? '') || Boolean(values.clientSecret)

  /**
   * One step for the workshop's own app: store whatever was typed, then go
   * to the vendor. Saving alone left people on a page where "Connect" did
   * nothing until they found the save button first.
   */
  const saveAndConnect = async () => {
    if (tenantDirty) {
      const ok = await onSave(values)
      if (!ok) return
    }
    window.location.assign(oauthStartUrl)
  }

  if (!enabled) {
    return <p className="text-sm text-muted-foreground">{t('connection.planLocked')}</p>
  }

  const generate = (key: string) => {
    setValues((v) => ({ ...v, [key]: generatePassword() }))
    setRevealed((r) => ({ ...r, [key]: true }))
    setGenerated((g) => ({ ...g, [key]: true }))
  }

  const copyValue = (key: string) => {
    navigator.clipboard.writeText(values[key] ?? '')
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000)
  }

  const usualFields = visibleFields.filter((f) => !f.advanced)
  const advancedFields = visibleFields.filter((f) => f.advanced)

  // With the settings first, only the ones the keys hang on lead: the
  // provider and its region or account. A bucket listed from the keys, the
  // folder and the schedule follow the keys, in the order a person needs them.
  const leading = new Set<string>([
    ...fields.flatMap((c) => (c.showWhen ? [c.showWhen.key] : [])),
    ...previewFields.flatMap((f) => f.preview?.settings ?? []),
  ])
  const leadingSettings = manifest.settingsFirst
    ? visibleSettings.filter((f) => leading.has(f.key))
    : []
  const trailingSettings = manifest.settingsFirst
    ? visibleSettings.filter((f) => !leading.has(f.key))
    : visibleSettings
  // The settings listed from the keys, such as the bucket, sit right after
  // them, and the check of the keys right after that, before the schedule.
  const keyedSettings = manifest.settingsFirst ? trailingSettings.filter((f) => f.preview) : []
  const restSettings = manifest.settingsFirst
    ? trailingSettings.filter((f) => !f.preview)
    : trailingSettings

  const [test, setTest] = useState<
    { status: 'idle' } | { status: 'running' } | { status: 'done'; result: PreviewTestResult }
  >({ status: 'idle' })
  // A result belongs to the values it was run on: any edit clears it.
  const formKey = JSON.stringify([values, settings])
  useEffect(() => {
    setTest({ status: 'idle' })
  }, [formKey])
  // The check needs the keys and what they point at, not a password that
  // only means something once a repository exists.
  const canTest =
    Boolean(manifest.testBeforeConnect) &&
    !visibleFields.some((f) => f.required && !f.generate && !values[f.key]?.trim()) &&
    !leadingSettings.some((f) => settingMissing(f, settings)) &&
    !keyedSettings.some((f) => settingMissing(f, settings))
  const runTest = async () => {
    setTest({ status: 'running' })
    const res = await previewIntegrationTest(manifest.id, values, settings)
    setTest({
      status: 'done',
      result:
        res.success && res.data ? res.data : { ok: false, step: 'settings', reason: res.error },
    })
  }
  const testResultText = (result: PreviewTestResult) => {
    const step = result.step && t.has(`connection.testSteps.${result.step}`)
    const head = step ? t(`connection.testSteps.${result.step}`) : t('connection.testFailed')
    return result.reason ? `${head}: ${result.reason}` : head
  }
  const settingsBox = (list: SettingField[]) =>
    list.length > 0 && (
      <div className="rounded-lg border p-3">
        <SettingFieldList
          connectorId={manifest.id}
          fields={list}
          values={settings}
          setValues={setSettings}
          remote={remote}
        />
      </div>
    )

  const credentialField = (f: CredentialField) => (
    <div key={f.key} className="space-y-1">
      <Label className="text-xs">{tc(`fields.${f.label}`)}</Label>
      {/* Vendor keys are not a login. Browsers ignore autocomplete="off"
          on a password field and fill the site's saved sign-in into it,
          with the username into the field before it, so the secrets
          ask for a "new password" instead, which nothing has saved,
          and the password managers are told to stay out. */}
      <div className="flex gap-2">
        <Input
          type={f.type === 'password' && !revealed[f.key] ? 'password' : 'text'}
          name={`${manifest.id}-${f.key}`}
          value={values[f.key] ?? ''}
          placeholder={f.key === 'clientSecret' && tenantReady ? '••••••••' : f.placeholder}
          onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          autoComplete={f.type === 'password' ? 'new-password' : 'off'}
          className={f.generate ? 'min-w-0 flex-1 font-mono' : undefined}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
        />
        {f.generate && f.type === 'password' && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setRevealed((r) => ({ ...r, [f.key]: !r[f.key] }))}
            aria-label={revealed[f.key] ? t('connection.hide') : t('connection.show')}
            title={revealed[f.key] ? t('connection.hide') : t('connection.show')}
          >
            {revealed[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {f.generate && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => generate(f.key)}>
            <KeyRound className="mr-1 h-3.5 w-3.5" />
            {t('connection.generate')}
          </Button>
          {values[f.key] && (
            <Button type="button" variant="outline" size="sm" onClick={() => copyValue(f.key)}>
              {copiedKey === f.key ? (
                <Check className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1 h-3.5 w-3.5" />
              )}
              {copiedKey === f.key ? t('connection.copied') : t('connection.copy')}
            </Button>
          )}
        </div>
      )}
      {f.generate && generated[f.key] && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('connection.generatedPasswordWarning')}
        </p>
      )}
      {f.help && <p className="text-xs text-muted-foreground">{tc(`fields.${f.help}`)}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      {manifest.auth.type === 'oauth2' && needsTenantApp && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{t('connection.ownAppTitle')}</p>
          <p className="mt-1 text-muted-foreground">
            {tc(manifest.auth.tenantHelp ?? 'tenantHelp')}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t('connection.redirectUri')}</p>
          <code className="block select-all break-all rounded bg-background px-2 py-1 text-xs">
            {redirectUri}
          </code>
        </div>
      )}

      {settingsBox(leadingSettings)}

      {usualFields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">{usualFields.map(credentialField)}</div>
      )}

      {/* What almost nobody needs, folded away: a second box on the page reads
          as a second thing to fill in. The fold is the browser's own, so it
          stays as the person left it while they type. */}
      {advancedFields.length > 0 && (
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            {t('connection.advanced')}
          </summary>
          <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
            {advancedFields.map(credentialField)}
          </div>
        </details>
      )}

      {settingsBox(keyedSettings)}

      {manifest.testBeforeConnect && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runTest}
              disabled={!canTest || test.status === 'running' || busy !== null}
            >
              {test.status === 'running' ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              )}
              {test.status === 'running' ? t('connection.testing') : t('connection.test')}
            </Button>
            {!canTest && test.status === 'idle' && (
              <p className="text-xs text-muted-foreground">{t('connection.testHint')}</p>
            )}
          </div>
          {test.status === 'done' &&
            (test.result.ok ? (
              <p className="flex items-start gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('connection.testOk')}
              </p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">{testResultText(test.result)}</span>
              </p>
            ))}
        </div>
      )}

      {settingsBox(restSettings)}

      <div className="flex flex-wrap gap-2">
        {manifest.auth.type === 'oauth2' ? (
          needsTenantApp ? (
            <Button
              data-save-shortcut
              onClick={saveAndConnect}
              disabled={busy !== null || !tenantComplete}
            >
              {busy === 'credentials' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              {t('connection.connectWith', { name })}
            </Button>
          ) : (
            <Button asChild>
              <a href={oauthStartUrl}>
                <Plug className="mr-2 h-4 w-4" />
                {t('connection.connectWith', { name })}
              </a>
            </Button>
          )
        ) : (
          <Button
            onClick={() => onSave(values, settings)}
            disabled={
              busy !== null ||
              settingsMissing ||
              visibleFields.some((f) => f.required && !values[f.key])
            }
          >
            {busy === 'credentials' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('connection.connect')}
          </Button>
        )}
      </div>
    </div>
  )
}

type SettingValues = Record<string, string | number | boolean>

const PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * 32 letters and digits from the browser's secure random source. Bytes at or
 * above the largest multiple of 62 are thrown away so every character is
 * equally likely.
 */
function generatePassword(length = 32): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let out = ''
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of bytes) {
      if (b < limit && out.length < length) out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]
    }
  }
  return out
}

/** Saved values under the manifest defaults, with an empty value for the rest. */
function initialSettingValues(
  fields: SettingField[],
  initial: Record<string, unknown>
): SettingValues {
  const out: SettingValues = {}
  for (const f of fields) {
    const v = initial[f.key]
    out[f.key] =
      (v as string | number | boolean | undefined) ??
      (f.default as string | number | boolean | undefined) ??
      (f.type === 'boolean' ? false : '')
  }
  return out
}

function visibleSettingFields(fields: SettingField[], values: SettingValues): SettingField[] {
  return fields.filter((f) => conditionMet(f.showWhen, values))
}

/**
 * The choices a select offers right now: its own list, or the list for the
 * current value of the setting it hangs on. Undefined when that value has no
 * list, which makes the select a text box.
 */
function optionsFor(f: SettingField, values: SettingValues): readonly SettingOption[] | undefined {
  if (!f.optionsBy) return f.options
  return f.optionsBy.options[String(values[f.optionsBy.key] ?? '')]
}

/**
 * Whether a setting still needs an answer before the form can go. A list that
 * hangs on another choice is the list of the only valid answers, so a code
 * left over from the previous provider counts as missing too.
 */
function settingMissing(f: SettingField, values: SettingValues): boolean {
  const current = values[f.key]
  if (f.type === 'select' && (f.required || f.optionsBy)) {
    const options = optionsFor(f, values)
    if (options) return !options.some((o) => o.value === current)
  }
  return Boolean(f.required) && (current === '' || current === undefined || current === null)
}

/**
 * A setting listed from the vendor. While there is a list, a picker; while
 * there is none and a typed name is accepted, a plain box, because a picker
 * with nothing in it reads as "wait" when the answer is "type it". A storage
 * key allowed one bucket but not to list them lands here every time.
 */
function RemoteSettingInput({
  connectorId,
  field,
  value,
  options,
  onChange,
}: {
  connectorId: string
  field: SettingField
  value: string
  options: SettingOption[] | null | undefined
  onChange: (value: string) => void
}) {
  const t = useTranslations('integrations')
  const tc = useTranslations(`integrations.connectors.${connectorId}`)
  const listed = Array.isArray(options) && options.length > 0
  if (field.allowCustom && options !== undefined && !listed) {
    return (
      <div className="space-y-1">
        <Input
          type="text"
          name={`${connectorId}-${field.key}`}
          className="h-8"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          placeholder={tc(`settings.${field.label}`)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* The keys were given and the vendor listed nothing: say so once. */}
        {Array.isArray(options) && (
          <p className="text-xs text-muted-foreground">{t('connection.listEmpty')}</p>
        )}
      </div>
    )
  }
  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={onChange}
      required={field.required}
      allowCustom={field.allowCustom}
      emptyHint={options === null ? t('connection.listNeedsKeys') : undefined}
    />
  )
}

/** The rows of a settings form, shared by the connect page and the settings card. */
function SettingFieldList({
  connectorId,
  fields,
  values,
  setValues,
  remote,
}: {
  connectorId: string
  fields: SettingField[]
  values: SettingValues
  setValues: (update: (prev: SettingValues) => SettingValues) => void
  /** Per source: the list, undefined while loading, null while it cannot be read yet. */
  remote: Record<string, SettingOption[] | null | undefined>
}) {
  const t = useTranslations('integrations')
  const tc = useTranslations(`integrations.connectors.${connectorId}`)
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div
          key={f.key}
          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="min-w-0">
            <Label className="text-sm">{tc(`settings.${f.label}`)}</Label>
            {f.help && <p className="text-xs text-muted-foreground">{tc(`settings.${f.help}`)}</p>}
          </div>
          <div className="sm:w-72 sm:shrink-0">
            {f.type === 'boolean' && (
              <Switch
                checked={Boolean(values[f.key])}
                onCheckedChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              />
            )}
            {(f.type === 'text' || f.type === 'number') && (
              <Input
                type={f.type}
                name={`${connectorId}-${f.key}`}
                className="h-8"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={String(values[f.key] ?? '')}
                onChange={(e) =>
                  setValues((s) => ({
                    ...s,
                    [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
              />
            )}
            {f.type === 'date' && (
              <DateInput
                value={String(values[f.key] ?? '')}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                placeholder={t('connection.noLimit')}
              />
            )}
            {f.type === 'remote-select' && (
              <RemoteSettingInput
                connectorId={connectorId}
                field={f}
                value={String(values[f.key] ?? '')}
                options={remote[f.source ?? '']}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              />
            )}
            {f.type === 'select' && optionsFor(f, values) === undefined && (
              // The choice this list hangs on has no list: anything goes.
              <Input
                type="text"
                name={`${connectorId}-${f.key}`}
                className="h-8"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                value={String(values[f.key] ?? '')}
                onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            )}
            {f.type === 'select' && optionsFor(f, values) !== undefined && (
              <Select
                // A value the current list does not have shows as unset.
                value={
                  optionsFor(f, values)?.some((o) => o.value === values[f.key])
                    ? String(values[f.key])
                    : ''
                }
                onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t('connection.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {(optionsFor(f, values) ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {tc.has(`settings.${o.label}`) ? tc(`settings.${o.label}`) : o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SettingsForm({
  connectorId,
  fields,
  initial,
  onSave,
  busy,
}: {
  connectorId: string
  fields: SettingField[]
  initial: Record<string, unknown>
  onSave: (values: Record<string, string | number | boolean>) => Promise<boolean>
  busy: boolean
}) {
  const t = useTranslations('integrations')
  const [values, setValues] = useState<SettingValues>(() => initialSettingValues(fields, initial))
  const [remote, setRemote] = useState<Record<string, SettingOption[] | null>>({})

  const remoteSources = useMemo(
    () =>
      fields.filter((f) => f.type === 'remote-select' && f.source).map((f) => f.source as string),
    [fields]
  )
  useEffect(() => {
    let cancelled = false
    for (const source of remoteSources) {
      getIntegrationRemoteOptions(connectorId, source).then((res) => {
        if (cancelled) return
        setRemote((r) => ({ ...r, [source]: res.success && res.data ? res.data : [] }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [connectorId, remoteSources])

  const visible = visibleSettingFields(fields, values)
  const missing = visible.some((f) => settingMissing(f, values))

  return (
    <AppCard
      title={t('connection.settingsTitle')}
      description={t('connection.settingsDescription')}
    >
      <div className="space-y-4">
        <SettingFieldList
          connectorId={connectorId}
          fields={visible}
          values={values}
          setValues={setValues}
          remote={remote}
        />
        <div className="flex justify-end">
          <Button onClick={() => onSave(values)} disabled={busy || missing}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('connection.save')}
          </Button>
        </div>
      </div>
    </AppCard>
  )
}

/** Log details on one line, key=value, so a lookup's fuel codes or a pass's counts are readable. */
function describeDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([k, v]) => {
      const text = Array.isArray(v)
        ? v.join(',')
        : typeof v === 'object' && v
          ? JSON.stringify(v)
          : String(v)
      return `${k}=${text}`
    })
    .join(' ')
}

function ActivityCard({
  activity,
  onRetry,
  onRetryBatch,
  busy,
}: {
  activity: Activity
  onRetry: (jobId: string) => void
  onRetryBatch: (batchId: string) => void
  busy: string | null
}) {
  const t = useTranslations('integrations.activity')
  const when = useWhen()
  return (
    <AppCard title={t('title')} description={t('description')}>
      {activity.items.length > 0 && (
        <div className="mb-4 divide-y rounded-lg border">
          {activity.items.map((item) =>
            item.type === 'batch' ? (
              <BatchRow
                key={item.batchId}
                batch={item}
                onRetry={onRetry}
                onRetryBatch={onRetryBatch}
                busy={busy}
              />
            ) : (
              <JobRow key={item.id} job={item} onRetry={onRetry} busy={busy} />
            )
          )}
        </div>
      )}
      {activity.logs.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-lg border p-2 font-mono text-xs">
          {activity.logs.map((l) => (
            <div
              key={l.id}
              className={
                l.level === 'error'
                  ? 'text-destructive'
                  : l.level === 'warn'
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
              }
            >
              <span className="mr-2 opacity-70">{when(l.createdAt)}</span>
              {l.message}
              {l.details && typeof l.details === 'object' ? (
                <span className="ml-2 opacity-70">
                  {describeDetails(l.details as Record<string, unknown>)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </AppCard>
  )
}

const FAILED = new Set(['failed', 'dead'])

function statusClass(status: string): string {
  if (FAILED.has(status)) return 'border-destructive/30 text-destructive'
  if (status === 'done') return 'border-emerald-500/30 text-emerald-600'
  return ''
}

/** Job kinds are shared by every connector, so their labels live at the namespace root. */
function useJobKindLabel() {
  const tk = useTranslations('integrations')
  return (kind: string) => (tk.has(`jobKinds.${kind}`) ? tk(`jobKinds.${kind}`) : kind)
}

function useWhen() {
  const format = useFormatter()
  return (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short' })
}

function JobRow({
  job,
  onRetry,
  busy,
}: {
  job: ActivityJob
  onRetry: (jobId: string) => void
  busy: string | null
}) {
  const t = useTranslations('integrations.activity')
  const kindLabel = useJobKindLabel()
  const when = useWhen()
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{kindLabel(job.kind)}</span>
        <span className="ml-2 text-xs text-muted-foreground">{when(job.createdAt)}</span>
        {job.error && <p className="truncate text-xs text-destructive">{job.error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-[11px] ${statusClass(job.status)}`}>
          {t(`jobStatus.${job.status}`)}
        </Badge>
        {FAILED.has(job.status) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onRetry(job.id)}
            disabled={busy !== null}
          >
            <Play className="mr-1 h-3 w-3" />
            {t('retry')}
          </Button>
        )}
      </div>
    </div>
  )
}

const COUNT_ORDER = ['queued', 'running', 'done', 'failed', 'dead'] as const

/**
 * A backfill as one line: the kind, how many jobs, and a badge per status
 * that is not zero. Opening it lists the failed jobs, each with its own
 * Retry, and one button to queue them all again.
 */
function BatchRow({
  batch,
  onRetry,
  onRetryBatch,
  busy,
}: {
  batch: Extract<ActivityItem, { type: 'batch' }>
  onRetry: (jobId: string) => void
  onRetryBatch: (batchId: string) => void
  busy: string | null
}) {
  const t = useTranslations('integrations.activity')
  const kindLabel = useJobKindLabel()
  const when = useWhen()
  const [open, setOpen] = useState(false)
  const total = COUNT_ORDER.reduce((sum, k) => sum + batch.counts[k], 0)
  const failedCount = batch.counts.failed + batch.counts.dead
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('details')}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
      >
        <div className="min-w-0">
          <span className="font-medium">{kindLabel(batch.kind)}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {t('jobs', { count: total })} · {when(batch.createdAt)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {COUNT_ORDER.filter((k) => batch.counts[k] > 0).map((k) => (
            <Badge key={k} variant="outline" className={`text-[11px] ${statusClass(k)}`}>
              {t(`counts.${k}`, { count: batch.counts[k] })}
            </Badge>
          ))}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t bg-muted/30">
          {batch.failures.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t('noFailures')}</p>
          ) : (
            <>
              {failedCount > 1 && (
                <div className="flex justify-end px-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onRetryBatch(batch.batchId)}
                    disabled={busy !== null}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    {t('retryFailed')}
                  </Button>
                </div>
              )}
              <div className="divide-y">
                {batch.failures.map((job) => (
                  <JobRow key={job.id} job={job} onRetry={onRetry} busy={busy} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
