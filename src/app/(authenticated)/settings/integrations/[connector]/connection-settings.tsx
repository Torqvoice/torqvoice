'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  Play,
  Plug,
  RefreshCw,
  RotateCcw,
  Unplug,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { DocsLink } from '@/components/docs-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  backfillIntegrationCalendar,
  type ConnectionView,
  disconnectIntegration,
  getIntegrationRemoteOptions,
  retryIntegrationJob,
  runIntegrationJob,
  saveIntegrationCredentials,
  testIntegration,
  updateIntegrationSettings,
} from '@/features/integrations/Actions/integrationActions'
import type {
  CredentialField,
  SettingField,
  SettingOption,
} from '@/features/integrations/Lib/types'

type Activity = {
  jobs: {
    id: string
    kind: string
    status: string
    attempts: number
    error: string | null
    runAfter: string
    finishedAt: string | null
    createdAt: string
  }[]
  logs: { id: string; level: string; message: string; createdAt: string }[]
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
  const [busy, setBusy] = useState<string | null>(null)

  // Outcome of an OAuth round trip lands here as a query parameter.
  useEffect(() => {
    const error = search.get('error')
    const connected = search.get('connected')
    if (connected) toast.success(t('connection.connected', { name: manifest.name }))
    if (error) toast.error(t.has(`errors.${error}`) ? t(`errors.${error}`) : t('errors.vendor'))
    if (error || connected) router.replace(`/settings/integrations/${manifest.id}`)
  }, [search, router, t, manifest])

  const isOAuth = manifest.auth.type === 'oauth2'
  const oauthNeedsTenantApp = isOAuth && !view.platformApp
  const connected = connection && (connection.status === 'active' || connection.status === 'error')
  const oauthStartUrl = `/api/integrations/${manifest.id}/oauth/start`

  const run = useCallback(
    async (
      key: string,
      fn: () => Promise<{ success: boolean; error?: string } | void>,
      done?: string
    ) => {
      setBusy(key)
      try {
        const res = await fn()
        if (res && !res.success) {
          toast.error(res.error || t('errors.generic'))
          return false
        }
        if (done) toast.success(done)
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
      title: t('connection.disconnectTitle', { name: manifest.name }),
      description: t('connection.disconnectDescription'),
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

  const firstSchedule = manifest.schedules?.[0]?.job
  const isCalendar = manifest.category === 'calendar'

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
            {manifest.name}
            {connection && <StatusBadge status={connection.status} />}
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

        {connection?.lastError && connection.status === 'error' && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t('connection.lastError')}</p>
              <p className="text-muted-foreground">{connection.lastError}</p>
            </div>
          </div>
        )}

        {connected ? (
          <div className="grid gap-4 text-sm sm:grid-cols-3">
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
          </div>
        ) : (
          <ConnectForm
            manifest={manifest}
            tenantClientId={connection?.tenantClientId ?? null}
            needsTenantApp={oauthNeedsTenantApp}
            redirectUri={view.redirectUri}
            oauthStartUrl={oauthStartUrl}
            enabled={view.enabled}
            busy={busy}
            onSave={(values) =>
              run(
                'credentials',
                () => saveIntegrationCredentials(manifest.id, values),
                isOAuth ? undefined : t('connection.connectedShort')
              )
            }
          />
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
            {firstSchedule && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(
                    'sync',
                    () => runIntegrationJob(manifest.id, firstSchedule),
                    t('connection.syncQueued')
                  )
                }
                disabled={busy !== null}
              >
                {busy === 'sync' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                {t('connection.syncNow')}
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
                disabled={busy !== null}
              >
                {busy === 'backfill' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3.5 w-3.5" />
                )}
                {t('connection.backfill')}
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

      {connected && manifest.settings.length > 0 && (
        <SettingsForm
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

      {connection && (activity.jobs.length > 0 || activity.logs.length > 0) && (
        <ActivityCard
          activity={activity}
          onRetry={(id) =>
            run(`retry:${id}`, () => retryIntegrationJob(id), t('connection.retryQueued'))
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
  onSave,
}: {
  manifest: ConnectionView['manifest']
  tenantClientId: string | null
  needsTenantApp: boolean
  redirectUri: string
  oauthStartUrl: string
  enabled: boolean
  busy: string | null
  onSave: (values: Record<string, string>) => Promise<boolean>
}) {
  const t = useTranslations('integrations')
  const tc = useTranslations(`integrations.connectors.${manifest.id}`)
  const fields: CredentialField[] =
    manifest.auth.type === 'oauth2'
      ? needsTenantApp
        ? (manifest.auth.tenantFields ?? [])
        : []
      : manifest.auth.fields
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    if (tenantClientId) initial.clientId = tenantClientId
    return initial
  })
  const tenantReady = Boolean(tenantClientId)
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

      {fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{tc(`fields.${f.label}`)}</Label>
              <Input
                type={f.type === 'password' ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                placeholder={f.key === 'clientSecret' && tenantReady ? '••••••••' : f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                autoComplete="off"
              />
              {f.help && <p className="text-xs text-muted-foreground">{tc(`fields.${f.help}`)}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {manifest.auth.type === 'oauth2' ? (
          needsTenantApp ? (
            <Button onClick={saveAndConnect} disabled={busy !== null || !tenantComplete}>
              {busy === 'credentials' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              {t('connection.connectWith', { name: manifest.name })}
            </Button>
          ) : (
            <Button asChild>
              <a href={oauthStartUrl}>
                <Plug className="mr-2 h-4 w-4" />
                {t('connection.connectWith', { name: manifest.name })}
              </a>
            </Button>
          )
        ) : (
          <Button
            onClick={() => onSave(values)}
            disabled={busy !== null || fields.some((f) => f.required && !values[f.key])}
          >
            {busy === 'credentials' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('connection.connect')}
          </Button>
        )}
      </div>
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
  const tc = useTranslations(`integrations.connectors.${connectorId}`)
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const out: Record<string, string | number | boolean> = {}
    for (const f of fields) {
      const v = initial[f.key]
      out[f.key] =
        (v as string | number | boolean | undefined) ??
        (f.default as string | number | boolean | undefined) ??
        (f.type === 'boolean' ? false : '')
    }
    return out
  })
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

  const visible = fields.filter((f) => !f.showWhen || values[f.showWhen.key] === f.showWhen.equals)
  const missing = visible.some((f) => f.required && !values[f.key])

  return (
    <AppCard
      title={t('connection.settingsTitle')}
      description={t('connection.settingsDescription')}
    >
      <div className="space-y-4">
        {visible.map((f) => (
          <div
            key={f.key}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <Label className="text-sm">{tc(`settings.${f.label}`)}</Label>
              {f.help && (
                <p className="text-xs text-muted-foreground">{tc(`settings.${f.help}`)}</p>
              )}
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
                  className="h-8"
                  value={String(values[f.key] ?? '')}
                  onChange={(e) =>
                    setValues((s) => ({
                      ...s,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    }))
                  }
                />
              )}
              {(f.type === 'select' || f.type === 'remote-select') && (
                <Select
                  value={String(values[f.key] ?? '')}
                  onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue
                      placeholder={
                        f.type === 'remote-select' && remote[f.source ?? ''] === undefined
                          ? t('connection.loading')
                          : t('connection.choose')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.type === 'select' ? (f.options ?? []) : (remote[f.source ?? ''] ?? [])).map(
                      (o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ))}
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

function ActivityCard({
  activity,
  onRetry,
  busy,
}: {
  activity: Activity
  onRetry: (jobId: string) => void
  busy: string | null
}) {
  const t = useTranslations('integrations.activity')
  const format = useFormatter()
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short' })
  return (
    <AppCard title={t('title')} description={t('description')}>
      {activity.jobs.length > 0 && (
        <div className="mb-4 divide-y rounded-lg border">
          {activity.jobs.map((j) => (
            <div
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{j.kind}</span>
                <span className="ml-2 text-xs text-muted-foreground">{when(j.createdAt)}</span>
                {j.error && <p className="truncate text-xs text-destructive">{j.error}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[11px] ${j.status === 'dead' || j.status === 'failed' ? 'border-destructive/30 text-destructive' : j.status === 'done' ? 'border-emerald-500/30 text-emerald-600' : ''}`}
                >
                  {t(`jobStatus.${j.status}`)}
                </Badge>
                {(j.status === 'dead' || j.status === 'failed') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onRetry(j.id)}
                    disabled={busy !== null}
                  >
                    <Play className="mr-1 h-3 w-3" />
                    {t('retry')}
                  </Button>
                )}
              </div>
            </div>
          ))}
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
            </div>
          ))}
        </div>
      )}
    </AppCard>
  )
}
