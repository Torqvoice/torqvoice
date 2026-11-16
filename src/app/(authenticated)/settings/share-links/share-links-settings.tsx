'use client'

import {
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  type LucideIcon,
  Receipt,
  Save,
  Search,
  Timer,
  Trash2,
  Video,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { DataTablePagination } from '@/components/data-table-pagination'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { revokeShareLinks } from '@/features/share-links/Actions/revokeShareLinks'
import { revokeInspectionPublicLink } from '@/features/inspections/Actions/inspectionShareActions'
import { revokeQuotePublicLink } from '@/features/quotes/Actions/quoteShareActions'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { revokePublicLink } from '@/features/vehicles/Actions/serviceActions'
import {
  SHARE_EXPIRY_MAX_DAYS,
  SHARE_EXPIRY_MODES,
  SHARE_EXPIRY_SETTING_KEYS,
  SHARE_KINDS,
  type ShareExpiryMode,
  type ShareExpiryRules,
  type ShareKind,
  shareExpiryDays,
} from '@/lib/share-expiry'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import {
  ShareExpiryControl,
  useShareExpiryText,
} from '@/features/share-links/Components/ShareExpiryControl'
import type {
  ShareLinkPage,
  ShareLinkRow,
  ShareLinkRowKind,
} from '@/features/share-links/Lib/listShareLinks.server'
import { ReadOnlyBanner, ReadOnlyWrapper, SaveButton } from '../read-only-guard'
import { useSettingsPermission } from '../settings-permission-context'

const KIND_ICONS: Record<ShareLinkRowKind, LucideIcon> = {
  invoice: Receipt,
  quote: FileText,
  inspection: ClipboardCheck,
  statusReport: Video,
}

const KIND_PATHS: Record<ShareLinkRowKind, string> = {
  invoice: 'invoice',
  quote: 'quote',
  inspection: 'inspection',
  statusReport: 'status-report',
}

const STATUS_FILTERS = ['active', 'expired', 'all'] as const
const KIND_FILTERS = ['all', 'invoice', 'quote', 'inspection', 'statusReport'] as const

type Filters = { status: string; kind: string; search: string }

/**
 * The workshop's rule for each kind of document: never, or a number of days
 * counted from the day the link was sent, or for an invoice from the day it
 * was paid. One Save for the three.
 */
function ExpiryRulesCard({ rules }: { rules: ShareExpiryRules }) {
  const t = useTranslations('settings.shareLinks')
  const router = useRouter()
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(
        SHARE_KINDS.map((kind) => [
          kind,
          { mode: rules[kind].mode, days: String(rules[kind].days) },
        ])
      ) as Record<ShareKind, { mode: ShareExpiryMode; days: string }>
  )
  const [saving, setSaving] = useState(false)

  const update = (kind: ShareKind, patch: Partial<{ mode: ShareExpiryMode; days: string }>) =>
    setDraft((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }))

  const save = async () => {
    setSaving(true)
    const entries: Record<string, string> = {}
    for (const kind of SHARE_KINDS) {
      entries[SHARE_EXPIRY_SETTING_KEYS[kind].mode] = draft[kind].mode
      entries[SHARE_EXPIRY_SETTING_KEYS[kind].days] = String(shareExpiryDays(draft[kind].days))
    }
    const result = await setSettings(entries).catch(() => null)
    setSaving(false)
    if (!result?.success) {
      toast.error(result?.error || t('saveFailed'))
      return
    }
    router.refresh()
    toast.success(t('saved'))
  }

  return (
    <AppCard
      id="share-links-rules"
      icon={Timer}
      title={t('rules.title')}
      description={t('rules.description')}
      contentClassName="space-y-5"
    >
      <div className="divide-y">
        {SHARE_KINDS.map((kind) => {
          const row = draft[kind]
          const Icon = KIND_ICONS[kind]
          return (
            <div
              key={kind}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="space-y-0.5">
                  <Label id={`share-expiry-${kind}-label`} className="text-sm font-medium">
                    {t(`rules.kind.${kind}`)}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t(`rules.hint.${row.mode}`)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
                <Select
                  value={row.mode}
                  onValueChange={(mode) => update(kind, { mode: mode as ShareExpiryMode })}
                >
                  <SelectTrigger
                    id={`share-expiry-${kind}`}
                    aria-labelledby={`share-expiry-${kind}-label`}
                    className="w-[13.5rem]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_EXPIRY_MODES[kind].map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(`rules.mode.${mode}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {row.mode !== 'never' && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={SHARE_EXPIRY_MAX_DAYS}
                      value={row.days}
                      onChange={(e) => update(kind, { days: e.target.value })}
                      aria-label={t('rules.daysLabel', { kind: t(`rules.kind.${kind}`) })}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">{t('rules.days')}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t('rules.appliesNote')}</p>
      <SaveButton>
        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </Button>
        </div>
      </SaveButton>
    </AppCard>
  )
}

/** Copy, open the document, revoke: what a row can do besides change its expiry. */
function RowActions({
  row,
  url,
  onRevoked,
}: {
  row: ShareLinkRow
  url: string
  onRevoked: () => void
}) {
  const t = useTranslations('settings.shareLinks.list')
  const tc = useTranslations('common')
  const confirm = useConfirm()
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  const revoke = async () => {
    if (row.kind === 'statusReport') return
    const ok = await confirm({
      title: t('revokeTitle'),
      description: t('revokeDescription', { document: row.label }),
      confirmLabel: t('revoke'),
      cancelLabel: tc('shareLink.expiry.cancel'),
      destructive: true,
    })
    if (!ok) return
    setRevoking(true)
    const action =
      row.kind === 'invoice'
        ? revokePublicLink
        : row.kind === 'quote'
          ? revokeQuotePublicLink
          : revokeInspectionPublicLink
    const result = await action(row.id).catch(() => null)
    setRevoking(false)
    if (!result?.success) {
      toast.error(tc('shareLink.revokeFailed'))
      return
    }
    toast.success(t('revoked'))
    onRevoked()
  }

  const iconButton =
    'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 md:h-8 md:w-8'

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={copy}
        className={iconButton}
        aria-label={t('copy')}
        title={t('copy')}
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </button>
      <Link href={row.href} className={iconButton} aria-label={t('open')} title={t('open')}>
        <ExternalLink className="h-4 w-4" />
      </Link>
      {row.kind !== 'statusReport' && (
        <SaveButton>
          <button
            type="button"
            onClick={revoke}
            disabled={revoking}
            className={cn(iconButton, 'hover:bg-destructive/10 hover:text-destructive')}
            aria-label={t('revoke')}
            title={t('revoke')}
          >
            {revoking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </SaveButton>
      )}
    </div>
  )
}

/** Where a row's link stands. A status report's date is its own and is only shown. */
function RowExpiry({ row, onChanged }: { row: ShareLinkRow; onChanged: () => void }) {
  const text = useShareExpiryText()
  if (row.kind === 'statusReport') {
    return (
      <span
        className={cn(
          'text-xs',
          row.expiry.expired ? 'font-medium text-destructive' : 'text-muted-foreground'
        )}
      >
        {text(row.expiry)}
      </span>
    )
  }
  return <ShareExpiryControl kind={row.kind} id={row.id} view={row.expiry} onChanged={onChanged} />
}

function LinksCard({
  links,
  baseUrl,
  filters,
}: {
  links: ShareLinkPage
  baseUrl: string
  filters: Filters
}) {
  const t = useTranslations('settings.shareLinks.list')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { formatDate } = useFormatDate()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(filters.search)

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') next.delete(key)
        else next.set(key, String(value))
      }
      // A new filter starts at its first page.
      if (!('page' in params)) next.delete('page')
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
    },
    [pathname, router, searchParams]
  )

  const refresh = () => router.refresh()

  // Ticked rows, for removing several links in one go. A status report's
  // link is the report itself, so those rows cannot be ticked.
  const tc = useTranslations('common')
  const confirm = useConfirm()
  const { canEdit } = useSettingsPermission()
  const keyOf = (row: ShareLinkRow) => `${row.kind}:${row.id}`
  const selectable = useMemo(
    () => (canEdit ? links.rows.filter((row) => row.kind !== 'statusReport') : []),
    [canEdit, links.rows]
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [removing, setRemoving] = useState(false)
  // Another page or filter shows other rows; a tick on a row no longer on
  // screen must not be removed with the rest.
  useEffect(() => {
    setSelected((prev) => {
      const onScreen = new Set(selectable.map((row) => `${row.kind}:${row.id}`))
      const kept = [...prev].filter((key) => onScreen.has(key))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [selectable])

  const toggle = (row: ShareLinkRow, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(keyOf(row))
      else next.delete(keyOf(row))
      return next
    })
  const allSelected = selectable.length > 0 && selected.size === selectable.length
  const toggleAll = (on: boolean) => setSelected(on ? new Set(selectable.map(keyOf)) : new Set())

  const removeSelected = async () => {
    const chosen = selectable.filter((row) => selected.has(keyOf(row)))
    if (chosen.length === 0) return
    const ok = await confirm({
      title: t('bulkRevokeTitle', { count: chosen.length }),
      description: t('bulkRevokeDescription'),
      confirmLabel: t('removeSelected'),
      cancelLabel: tc('shareLink.expiry.cancel'),
      destructive: true,
    })
    if (!ok) return
    setRemoving(true)
    const result = await revokeShareLinks({
      links: chosen.map((row) => ({ kind: row.kind, id: row.id })),
    }).catch(() => null)
    setRemoving(false)
    if (!result?.success || !result.data) {
      // Refused or unanswered: the links may still work, so say so.
      toast.error(result ? t('bulkRevokeFailed') : tc('shareLink.revokeFailed'))
      return
    }
    setSelected(new Set())
    toast.success(t('bulkRevoked', { count: result.data.removed }))
    refresh()
  }

  const rowCheckbox = (row: ShareLinkRow) =>
    row.kind !== 'statusReport' && canEdit ? (
      <Checkbox
        checked={selected.has(keyOf(row))}
        onCheckedChange={(value) => toggle(row, value === true)}
        aria-label={t('selectRow', { document: row.label })}
      />
    ) : null

  const urlOf = (row: ShareLinkRow) =>
    `${baseUrl}/share/${KIND_PATHS[row.kind]}/${links.organizationId}/${row.token}`

  const empty = (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {filters.search || filters.kind !== 'all' ? t('emptyFiltered') : t(`empty.${filters.status}`)}
    </div>
  )

  return (
    <AppCard
      id="share-links-list"
      icon={Link2}
      title={t('title')}
      description={t('description')}
      contentClassName="space-y-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label={t('statusLabel')}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible"
        >
          {STATUS_FILTERS.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={filters.status === status ? 'default' : 'outline'}
              aria-pressed={filters.status === status}
              onClick={() => navigate({ status: status === 'active' ? undefined : status })}
              className="shrink-0"
            >
              {t(`status.${status}`)}
              {status !== 'all' && (
                <span className="ml-1.5 tabular-nums opacity-70">{links.counts[status]}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={filters.kind}
            onValueChange={(kind) => navigate({ kind: kind === 'all' ? undefined : kind })}
          >
            <SelectTrigger className="h-9 sm:w-44" aria-label={t('kindLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_FILTERS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`kind.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form
            className="relative sm:w-56"
            onSubmit={(e) => {
              e.preventDefault()
              navigate({ search: search.trim() || undefined })
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                if (e.target.value === '' && filters.search) navigate({ search: undefined })
              }}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="h-9 pl-9"
            />
          </form>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label={t('selectedCount', { count: selected.size })}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2"
        >
          <span className="text-sm font-medium">
            {t('selectedCount', { count: selected.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => toggleAll(false)}>
              {t('clearSelection')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={removeSelected}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t('removeSelected')}
            </Button>
          </div>
        </div>
      )}

      <div className={cn('space-y-4 transition-opacity', isPending && 'opacity-60')}>
        {/* Phones and narrow tablets: one card per link. */}
        <div className="space-y-2 md:hidden">
          {links.rows.length === 0
            ? empty
            : links.rows.map((row) => {
                const Icon = KIND_ICONS[row.kind]
                return (
                  <div key={`${row.kind}-${row.id}`} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      {rowCheckbox(row) && <div className="pt-0.5">{rowCheckbox(row)}</div>}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {t(`kindOne.${row.kind}`)}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-medium">{row.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[row.customer, row.detail].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <RowActions row={row} url={urlOf(row)} onRevoked={refresh} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                      <RowExpiry row={row} onChanged={refresh} />
                      <span className="text-xs text-muted-foreground">
                        {row.sharedAt ? t('sharedOn', { date: formatDate(row.sharedAt) }) : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
        </div>

        {/* Wider screens: the table. */}
        <div className="hidden overflow-hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                      onCheckedChange={(value) => toggleAll(value === true)}
                      disabled={selectable.length === 0}
                      aria-label={t('selectAll')}
                    />
                  </TableHead>
                )}
                <TableHead>{t('columns.document')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('columns.customer')}</TableHead>
                <TableHead className="w-[110px]">{t('columns.shared')}</TableHead>
                <TableHead className="hidden w-[70px] text-right xl:table-cell">
                  {t('columns.views')}
                </TableHead>
                <TableHead>{t('columns.expires')}</TableHead>
                <TableHead className="w-[120px] text-right">
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 7 : 6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {filters.search || filters.kind !== 'all'
                      ? t('emptyFiltered')
                      : t(`empty.${filters.status}`)}
                  </TableCell>
                </TableRow>
              ) : (
                links.rows.map((row) => {
                  const Icon = KIND_ICONS[row.kind]
                  return (
                    <TableRow
                      key={`${row.kind}-${row.id}`}
                      data-state={selected.has(keyOf(row)) ? 'selected' : undefined}
                    >
                      {canEdit && <TableCell>{rowCheckbox(row)}</TableCell>}
                      <TableCell className="max-w-[260px]">
                        <div className="flex items-start gap-2.5">
                          <Icon
                            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <Link
                              href={row.href}
                              className="block truncate text-sm font-medium hover:underline"
                            >
                              {row.label}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">
                              {[t(`kindOne.${row.kind}`), row.detail].filter(Boolean).join(' · ')}
                            </p>
                            <p className="truncate text-xs text-muted-foreground lg:hidden">
                              {row.customer}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[180px] truncate text-sm lg:table-cell">
                        {row.customer || <span className="text-muted-foreground">{t('none')}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {row.sharedAt ? formatDate(row.sharedAt) : t('none')}
                      </TableCell>
                      <TableCell className="hidden text-right text-sm tabular-nums text-muted-foreground xl:table-cell">
                        {row.viewCount ?? t('none')}
                      </TableCell>
                      <TableCell>
                        <RowExpiry row={row} onChanged={refresh} />
                      </TableCell>
                      <TableCell>
                        <RowActions row={row} url={urlOf(row)} onRevoked={refresh} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination
          total={links.total}
          page={links.page}
          pageSize={links.pageSize}
          totalPages={links.totalPages}
          onNavigate={navigate}
        />
      </div>
    </AppCard>
  )
}

export function ShareLinksSettings({
  rules,
  links,
  baseUrl,
  filters,
}: {
  rules: ShareExpiryRules
  links: ShareLinkPage | null
  baseUrl: string
  filters: Filters
}) {
  const t = useTranslations('settings.shareLinks')
  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
        <ExpiryRulesCard rules={rules} />
      </ReadOnlyWrapper>
      {links ? (
        <LinksCard links={links} baseUrl={baseUrl} filters={filters} />
      ) : (
        <AppCard icon={Link2} title={t('list.title')}>
          <p className="text-sm text-muted-foreground">{t('list.loadFailed')}</p>
        </AppCard>
      )}
    </div>
  )
}
