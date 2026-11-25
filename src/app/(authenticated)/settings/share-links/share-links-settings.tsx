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
import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
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
import { getShareLinkRows } from '@/features/share-links/Actions/getShareLinkRows'
import { revokeShareLinks } from '@/features/share-links/Actions/revokeShareLinks'
import { revokeInspectionPublicLink } from '@/features/inspections/Actions/inspectionShareActions'
import { revokeQuotePublicLink } from '@/features/quotes/Actions/quoteShareActions'
import { setSettings } from '@/features/settings/Actions/settingsActions'
import { revokePublicLink } from '@/features/vehicles/Actions/serviceActions'
import { useLoadedRowSelection } from '@/hooks/use-loaded-row-selection'
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
import type { Cursor } from '@/lib/keyset'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import {
  ShareExpiryControl,
  useShareExpiryText,
} from '@/features/share-links/Components/ShareExpiryControl'
import type {
  ShareLinkBatch,
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
  /** The first batch, rendered on the server. */
  links: ShareLinkBatch
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

  // The same filters the page's first batch was read with, so every batch
  // after it continues that list.
  const list = useInfiniteRows<ShareLinkRow, Cursor, ShareLinkBatch>({
    queryKey: ['share-links', links.organizationId, filters],
    initial: links,
    fetchPage: (cursor) => getShareLinkRows({ ...filters, cursor }),
  })
  const rows = list.rows
  const counts = list.firstPage.counts ?? { active: 0, expired: 0 }

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') next.delete(key)
        else next.set(key, String(value))
      }
      // An old ?page= means nothing now: the list loads more as it scrolls.
      next.delete('page')
      next.delete('pageSize')
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
  // An invoice and a quote can share an id, so a row is known by its kind
  // as well. Only loaded rows can be ticked; another search, filter or sort
  // is another list and starts with nothing ticked, as everywhere else.
  const selectable = useMemo(
    () =>
      (canEdit ? rows.filter((row) => row.kind !== 'statusReport') : []).map((row) => ({
        id: `${row.kind}:${row.id}`,
        row,
      })),
    [canEdit, rows]
  )
  const selection = useLoadedRowSelection(selectable, list.listKey)
  const [removing, setRemoving] = useState(false)

  const removeSelected = async () => {
    const chosen = selection.selectedRows.map(({ row }) => row)
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
    selection.clear()
    toast.success(t('bulkRevoked', { count: result.data.removed }))
    refresh()
  }

  const rowCheckbox = (row: ShareLinkRow) =>
    row.kind !== 'statusReport' && canEdit ? (
      <Checkbox
        checked={selection.isSelected(keyOf(row))}
        onCheckedChange={() => selection.toggle(keyOf(row))}
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
      // The settings pane is narrow next to two sidebars (about 360px wide on
      // a 1024px screen), so the layout follows the card's width, not the
      // window's.
      contentClassName="@container space-y-4"
      // Clips its corners without hiding overflow, which would make the card
      // the box the table's header sticks to instead of the settings pane.
      className="overflow-clip"
    >
      {/* Where another filter, search or sort takes the pane back to. */}
      <div
        data-infinite-list=""
        className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between"
      >
        <div
          role="group"
          aria-label={t('statusLabel')}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 @md:flex-wrap @md:overflow-visible"
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
                <span className="ml-1.5 tabular-nums opacity-70">{counts[status]}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2 @md:flex-row">
          <Select
            value={filters.kind}
            onValueChange={(kind) => navigate({ kind: kind === 'all' ? undefined : kind })}
          >
            <SelectTrigger className="h-9 @md:w-44" aria-label={t('kindLabel')}>
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
            className="relative @md:w-56"
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
          <InfiniteListCount shown={rows.length} total={list.total} className="self-center" />
        </div>
      </div>

      {selection.count > 0 && (
        <div
          role="region"
          aria-label={t('selectedCount', { count: selection.count })}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2"
        >
          <span className="text-sm font-medium">
            {t('selectedCount', { count: selection.count })}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={selection.clear}>
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
        {/* A narrow card: one card per link. The list grows in the settings
            pane, which is what scrolls; another filter takes the pane back
            to the list's top. */}
        <div className="space-y-2 @2xl:hidden">
          {rows.length === 0
            ? empty
            : rows.map((row) => {
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
          {rows.length > 0 && <InfiniteListFooter state={list} />}
        </div>

        {/* A wide card: the table. It grows in the settings pane too, and its
            header sticks to the top of the pane. Nothing between them may
            scroll or hide overflow, or the header sticks to that instead:
            the rounded border clips with overflow-clip, which does not. */}
        <div className="hidden overflow-clip rounded-lg border @2xl:block">
          <Table containerClassName="overflow-visible" className="table-fixed">
            <TableHeader sticky>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selection.headerState}
                      onCheckedChange={selection.toggleAll}
                      disabled={selectable.length === 0}
                      aria-label={t('selectAll')}
                    />
                  </TableHead>
                )}
                {/* The document takes what the fixed columns leave. The
                    customer gets its own column only when there is room for
                    one; until then it is the document's third line. */}
                <TableHead>{t('columns.document')}</TableHead>
                <TableHead className="hidden w-[24%] @5xl:table-cell">
                  {t('columns.customer')}
                </TableHead>
                <TableHead className="w-[104px]">{t('columns.shared')}</TableHead>
                <TableHead className="hidden w-[64px] text-right @5xl:table-cell">
                  {t('columns.views')}
                </TableHead>
                <TableHead className="w-[168px]">{t('columns.expires')}</TableHead>
                <TableHead className="w-[116px] text-right">
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
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
                rows.map((row) => {
                  const Icon = KIND_ICONS[row.kind]
                  return (
                    <TableRow
                      key={`${row.kind}-${row.id}`}
                      data-state={selection.isSelected(keyOf(row)) ? 'selected' : undefined}
                    >
                      {canEdit && <TableCell>{rowCheckbox(row)}</TableCell>}
                      <TableCell>
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
                            <p className="truncate text-xs text-muted-foreground @5xl:hidden">
                              {row.customer}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden truncate text-sm @5xl:table-cell">
                        {row.customer || <span className="text-muted-foreground">{t('none')}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {row.sharedAt ? formatDate(row.sharedAt) : t('none')}
                      </TableCell>
                      <TableCell className="hidden text-right text-sm tabular-nums text-muted-foreground @5xl:table-cell">
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
              {rows.length > 0 && <InfiniteTableFooter state={list} colSpan={canEdit ? 7 : 6} />}
            </TableBody>
          </Table>
        </div>
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
  links: ShareLinkBatch | null
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
