'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

import { useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import type { Cursor } from '@/lib/keyset'
import { getUserRows } from '../Actions/getUserRows'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  ChevronRight,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useFormatDate } from '@/lib/use-format-date'

type UserRow = {
  id: string
  name: string
  email: string
  isSuperAdmin: boolean
  emailVerified: boolean
  createdAt: string
  lastSeen: string | null
  organizationCount: number
}

function OnlineDot({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) return null
  const isOnline = Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000
  if (!isOnline) return null
  return (
    <span className="relative flex h-2 w-2" title="Online">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
    </span>
  )
}

/** One batch of the list; the first also carries the total. */
type UserBatch = {
  rows: UserRow[]
  nextCursor: Cursor | null
  total?: number
}

export function AdminUsers({
  data,
  search,
  sortBy,
  sortOrder,
}: {
  /** The first batch, rendered on the server. */
  data: UserBatch
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}) {
  const t = useTranslations('admin')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { formatDate, formatDateTime } = useFormatDate()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()

  // The same filters the page's first batch was read with, so every batch
  // after it continues that list. The list is the whole platform's, not a
  // workshop's.
  const filters = { search: search || undefined, sortBy, sortOrder }
  const list = useInfiniteRows<UserRow, Cursor, UserBatch>({
    queryKey: ['admin-users', filters],
    initial: data,
    fetchPage: (cursor) => getUserRows({ ...filters, cursor }),
  })
  const users = list.rows

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') {
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

  // Live search: filters as you type, no Enter required. Submitting the
  // form (Enter) commits immediately, bypassing the debounce.
  const {
    value: searchInput,
    setValue: setSearchInput,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => navigate({ search: term }))

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc'
      navigate({ sortBy: column, sortOrder: newOrder })
    },
    [navigate, sortBy, sortOrder]
  )

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('users.searchPlaceholder')}
            aria-label={t('users.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-9"
            {...tableNav.searchInputProps}
          />
        </form>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <InfiniteListCount shown={users.length} total={list.total} />
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
        {users.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {search ? t('users.noResults') : t('users.noUsers')}
          </div>
        ) : (
          users.map((user) => (
            // The card only ever opens the user. Nothing that changes an
            // account is one tap away from a list scrolled with a thumb.
            <button
              key={user.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border bg-card p-3 text-left"
              onClick={() => router.push(`/admin/users/${user.id}`)}
            >
              <div className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{user.name}</span>
                  {user.isSuperAdmin ? (
                    <Badge variant="default" className="shrink-0 gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      {t('users.superAdmin')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      {t('users.user')}
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{user.email}</span>
                  {user.emailVerified && (
                    <span title={t('users.emailVerified')}>
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    </span>
                  )}
                </span>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t('users.orgs')}: {user.organizationCount}
                  </span>
                  <span>{formatDate(user.createdAt)}</span>
                  {user.lastSeen &&
                  Date.now() - new Date(user.lastSeen).getTime() < 5 * 60 * 1000 ? (
                    <span className="flex items-center gap-1.5">
                      <OnlineDot lastSeen={user.lastSeen} />
                      <span className="text-green-600 dark:text-green-400">
                        {t('users.online')}
                      </span>
                    </span>
                  ) : (
                    user.lastSeen && <span>{formatDateTime(user.lastSeen)}</span>
                  )}
                </div>
              </div>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
        {users.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up) - only the rows scroll */}
      <div
        className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-lg border md:flex"
        {...tableNav.containerProps}
      >
        <Table containerClassName="min-h-0 flex-1">
          <TableHeader sticky>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('name')}
                >
                  {t('users.name')}
                  <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('email')}
                >
                  {t('users.email')}
                  <SortIcon column="email" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('isSuperAdmin')}
                >
                  {t('users.role')}
                  <SortIcon column="isSuperAdmin" />
                </button>
              </TableHead>
              <TableHead className="text-center">{t('users.orgs')}</TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('createdAt')}
                >
                  {t('users.created')}
                  <SortIcon column="createdAt" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('lastSeen')}
                >
                  {t('users.lastSeen')}
                  <SortIcon column="lastSeen" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {search ? t('users.noResults') : t('users.noUsers')}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  {...interactiveRow(() => router.push(`/admin/users/${user.id}`))}
                >
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {user.email}
                      {user.emailVerified && (
                        <span title={t('users.emailVerified')}>
                          <BadgeCheck className="h-4 w-4 text-blue-500" />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {user.isSuperAdmin ? (
                      <Badge variant="default" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        {t('users.superAdmin')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t('users.user')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{user.organizationCount}</TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    {user.lastSeen &&
                    Date.now() - new Date(user.lastSeen).getTime() < 5 * 60 * 1000 ? (
                      <span className="flex items-center gap-1.5">
                        <OnlineDot lastSeen={user.lastSeen} />
                        <span className="text-sm text-green-600 dark:text-green-400">
                          {t('users.online')}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {user.lastSeen ? formatDateTime(user.lastSeen) : '—'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
            {users.length > 0 && <InfiniteTableFooter state={list} colSpan={6} />}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
