'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LIST_SORT_COOKIE,
  LIST_SORT_COOKIE_MAX_AGE,
  parseListSortCookie,
  type ListKey,
} from '@/lib/list-sort-preference'

/**
 * Records the sort a list is currently showing, so returning to it later comes
 * back in the same order. See `resolveListSort` for the read side.
 *
 * It watches the URL rather than wrapping each table's sort handler: every list
 * already routes a column click through `?sortBy=`, so this needs no changes to
 * the existing handlers and cannot fall out of step with them.
 */
export function useRememberedSort(list: ListKey) {
  const searchParams = useSearchParams()
  const sortBy = searchParams.get('sortBy')
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

  useEffect(() => {
    // No column in the URL means the page is on its default or on what was
    // already remembered; either way there is nothing new to store.
    if (!sortBy) return

    const next = { ...readCookie(), [list]: `${sortBy}:${sortOrder}` }
    document.cookie = `${LIST_SORT_COOKIE}=${encodeURIComponent(
      JSON.stringify(next)
    )}; path=/; max-age=${LIST_SORT_COOKIE_MAX_AGE}; SameSite=Lax`
  }, [list, sortBy, sortOrder])
}

function readCookie(): Record<string, string> {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${LIST_SORT_COOKIE}=`))
  if (!match) return {}
  try {
    return parseListSortCookie(decodeURIComponent(match.slice(LIST_SORT_COOKIE.length + 1)))
  } catch {
    return {}
  }
}
