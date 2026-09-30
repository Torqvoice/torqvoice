'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LIST_COLUMNS_COOKIE,
  LIST_COLUMNS_COOKIE_MAX_AGE,
  parseListColumnsCookie,
} from '@/lib/list-columns'
import type { ListKey } from '@/lib/list-sort-preference'

/**
 * The optional columns a table is showing, and turning one on or off.
 *
 * The server renders the page from the same cookie (`resolveListColumns`), so
 * the list starts with the right columns; this keeps the table in step while
 * the menu is being used and writes the choice back. `router.refresh()` after
 * a change so a column that needs a wider query gets one on the next load.
 */
export function useListColumns(list: ListKey, initial: string[]) {
  const router = useRouter()
  const [columns, setColumns] = useState<string[]>(initial)

  const toggle = useCallback(
    (column: string, on: boolean) => {
      setColumns((current) => {
        const next = on
          ? current.includes(column)
            ? current
            : [...current, column]
          : current.filter((c) => c !== column)
        write(list, next)
        return next
      })
      router.refresh()
    },
    [list, router]
  )

  return { columns, shows: (column: string) => columns.includes(column), toggle }
}

function write(list: ListKey, columns: string[]) {
  const next = { ...read(), [list]: columns }
  document.cookie = `${LIST_COLUMNS_COOKIE}=${encodeURIComponent(
    JSON.stringify(next)
  )}; path=/; max-age=${LIST_COLUMNS_COOKIE_MAX_AGE}; SameSite=Lax`
}

function read(): Partial<Record<ListKey, string[]>> {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${LIST_COLUMNS_COOKIE}=`))
  if (!match) return {}
  return parseListColumnsCookie(match.slice(LIST_COLUMNS_COOKIE.length + 1))
}
