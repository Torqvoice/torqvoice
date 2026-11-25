'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useCallback, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { type ServerBatch, useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { getAuditLogRows } from '@/features/audit/Actions/getAuditLogRows'
import type { Cursor } from '@/lib/keyset'
import { useFormatDate } from '@/lib/use-format-date'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { auditSummaryParams } from '@/features/audit/Lib/summaryParams'
import { cn } from '@/lib/utils'
import { ExternalLink, Search, Loader2 } from 'lucide-react'

type AuditLogRow = {
  id: string
  timestamp: Date
  action: string
  entity: string | null
  entityId: string | null
  message: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
  ip: string | null
  userAgent: string | null
  user: { id: string; name: string | null; email: string | null } | null
}

/** One batch of the log; the first also carries the total and the filter choices. */
type AuditLogBatch = {
  rows: AuditLogRow[]
  nextCursor: Cursor | null
  total?: number
  filters?: {
    actions: string[]
    entities: string[]
    users: { id: string; name: string | null; email: string | null }[]
  }
}

const NO_FILTERS: NonNullable<AuditLogBatch['filters']> = { actions: [], entities: [], users: [] }

function getActionColor(action: string): string {
  if (action.includes('delete') || action.includes('remove')) return 'destructive'
  if (action.includes('create') || action.includes('invite') || action.includes('send'))
    return 'default'
  if (action.includes('update') || action.includes('status') || action.includes('complete'))
    return 'secondary'
  return 'outline'
}

export function AuditLogClient({
  data,
  listScope = '',
  search,
  actionFilter,
  entityFilter,
  userFilter,
}: {
  /** The first batch, rendered on the server. */
  data: ServerBatch<AuditLogBatch>
  /** The workshop, so one workshop's cached rows never show in another's. */
  listScope?: string
  search: string
  actionFilter: string
  entityFilter: string
  userFilter: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null)
  const { formatDateTime } = useFormatDate()
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('audit')
  const ti = useTranslations('integrations')

  // The same filters the page's first batch was read with, so every batch
  // after it continues that list.
  const filters = {
    search: search || undefined,
    action: actionFilter === 'all' ? undefined : actionFilter,
    entity: entityFilter === 'all' ? undefined : entityFilter,
    userId: userFilter === 'all' ? undefined : userFilter,
  }
  const list = useInfiniteRows<AuditLogRow, Cursor, AuditLogBatch>({
    queryKey: ['audit-log', listScope, filters],
    initial: data,
    fetchPage: (cursor) => getAuditLogRows({ ...filters, cursor }),
  })
  const logs = list.rows
  const filterOptions = list.firstPage.filters ?? NO_FILTERS

  const getActionLabel = (action: string) => {
    // next-intl returns a placeholder for a missing message rather than
    // throwing, so this asks first instead of catching something that never
    // happens. replaceAll because an action can carry more than one separator.
    const key = `actions.${action.replaceAll('.', '_')}`
    return t.has(key) ? t(key) : action
  }

  /**
   * The sentence, in the reader's language where we can manage it.
   *
   * Rows written before this existed, and any written by a build that does not
   * know the key, still have the English the event was composed with. That is
   * the fallback rather than a blank cell: a log entry nobody can read is
   * worse than one in the wrong language.
   */
  const getSummary = (log: AuditLogRow) => {
    const details = log.metadata?.details as
      | { key?: string; params?: Record<string, string | number> }
      | undefined
    if (details?.key) {
      const key = `summary.${details.key}`
      // An integration named by id gets the reader's name for it (the
      // English name the row was written with stands in for the vendors),
      // and an amount stored with its currency reads as money.
      const params = auditSummaryParams(details.params, {
        connectorName: (id) =>
          ti.has(`connectors.${id}.name`) ? ti(`connectors.${id}.name`) : null,
        formatCurrency,
      })
      if (t.has(key)) return t(key, params)
    }
    return log.message
  }

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '' || value === 'all') {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }
      // An old ?page= means nothing now: the list loads more as it scrolls.
      newParams.delete('page')
      newParams.delete('pageSize')
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Filters */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            defaultValue={search}
            onChange={(e) => {
              const value = e.target.value
              if (value === search) return
              navigate({ search: value || undefined })
            }}
            className="h-9 pl-9 pr-9"
            {...tableNav.searchInputProps}
          />
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <SearchableSelect
            value={actionFilter}
            onValueChange={(v) => navigate({ action: v })}
            className="w-[180px]"
            options={[
              { value: 'all', label: t('allActions') },
              ...filterOptions.actions.map((a) => ({
                value: a,
                label: getActionLabel(a),
                keywords: a,
              })),
            ]}
          />
          <SearchableSelect
            value={entityFilter}
            onValueChange={(v) => navigate({ entity: v })}
            className="w-[160px]"
            options={[
              { value: 'all', label: t('allEntities') },
              ...filterOptions.entities.map((e) => ({ value: e, label: e })),
            ]}
          />
          <SearchableSelect
            value={userFilter}
            onValueChange={(v) => navigate({ userId: v })}
            className="w-[160px]"
            options={[
              { value: 'all', label: t('allUsers') },
              ...filterOptions.users.map((u) => ({
                value: u.id,
                label: u.name || u.email || u.id.substring(0, 8),
                keywords: u.email ?? '',
              })),
            ]}
          />
          <InfiniteListCount shown={logs.length} total={list.total} className="self-center" />
        </div>
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('noLogsFound')}
          </div>
        ) : (
          logs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setSelectedLog(log)}
              className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <Badge
                  variant={
                    getActionColor(log.action) as
                      | 'default'
                      | 'secondary'
                      | 'destructive'
                      | 'outline'
                  }
                >
                  {getActionLabel(log.action)}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                  {formatDateTime(log.timestamp)}
                </span>
              </div>
              {getSummary(log) && <p className="mt-1.5 text-sm">{getSummary(log)}</p>}
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {log.user?.name || log.user?.email || t('unknownUser')}
                {log.entityId && (
                  <span className="font-mono"> · {log.entityId.substring(0, 8)}</span>
                )}
              </p>
            </button>
          ))
        )}
        {logs.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up) - only the rows scroll */}
      <div
        className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-md border md:flex"
        {...tableNav.containerProps}
      >
        <TableContextMenuHint />
        <Table containerClassName="min-h-0 flex-1">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-[170px]">{t('timestamp')}</TableHead>
              <TableHead className="w-[140px]">{t('user')}</TableHead>
              <TableHead className="w-[200px]">{t('action')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('details')}</TableHead>
              <TableHead className="hidden lg:table-cell w-[100px]">{t('entityId')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t('noLogsFound')}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <ContextMenu key={log.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className="cursor-pointer"
                      {...interactiveRow(() => setSelectedLog(log))}
                    >
                      <TableCell
                        className="text-xs text-muted-foreground whitespace-nowrap"
                        suppressHydrationWarning
                      >
                        {formatDateTime(log.timestamp)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.user?.name || log.user?.email || t('unknownUser')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            getActionColor(log.action) as
                              | 'default'
                              | 'secondary'
                              | 'destructive'
                              | 'outline'
                          }
                        >
                          {getActionLabel(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[300px]">
                        {getSummary(log)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                        {log.entityId?.substring(0, 8)}
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => setSelectedLog(log)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t('logDetails')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
            {logs.length > 0 && <InfiniteTableFooter state={list} colSpan={5} />}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('logDetails')}</DialogTitle>
            <DialogDescription>
              {selectedLog && getActionLabel(selectedLog.action)}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="grid gap-3 text-sm">
              <DetailRow
                label={t('timestamp')}
                value={formatDateTime(selectedLog.timestamp)}
                suppressHydrationWarning
              />
              <DetailRow
                label={t('user')}
                value={selectedLog.user?.name || selectedLog.user?.email || t('unknownUser')}
              />
              <DetailRow label={t('action')} value={getActionLabel(selectedLog.action)} />
              {getSummary(selectedLog) && (
                <DetailRow label={t('details')} value={getSummary(selectedLog) as string} />
              )}
              {selectedLog.entity && <DetailRow label={t('entity')} value={selectedLog.entity} />}
              {selectedLog.entityId && (
                <DetailRow label={t('entityId')} value={selectedLog.entityId} mono />
              )}
              {selectedLog.ip && <DetailRow label={t('ipAddress')} value={selectedLog.ip} mono />}
              {selectedLog.userAgent && (
                <DetailRow
                  label={t('userAgentLabel')}
                  value={selectedLog.userAgent}
                  className="break-all"
                />
              )}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <span className="font-medium text-muted-foreground">{t('metadata')}</span>
                  <pre className="mt-1 rounded-md bg-muted p-2 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
  className,
  suppressHydrationWarning,
}: {
  label: string
  value: string
  mono?: boolean
  className?: string
  suppressHydrationWarning?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(mono ? 'font-mono text-xs' : '', className)}
        suppressHydrationWarning={suppressHydrationWarning}
      >
        {value}
      </span>
    </div>
  )
}
