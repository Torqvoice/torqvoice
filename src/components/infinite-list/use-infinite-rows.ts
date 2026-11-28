'use client'

import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ActionResult } from '@/lib/with-auth'

/**
 * A list that loads more rows as it scrolls.
 *
 * The page renders the first batch on the server, as it always has, and hands
 * it here; the rest arrive through a server action when the end of the list
 * comes near (`<InfiniteListFooter>` watches for that). Batches are keyset
 * pages (lib/keyset.ts), so a job added at the top while somebody scrolls
 * neither repeats a row nor skips one.
 *
 * The batches live in the TanStack Query cache under `queryKey`, which is why
 * leaving for a row and pressing Back finds the list as it was, scrolled to
 * where it was. The key is everything the server query depends on: the
 * workshop, the search, the filters and the sort.
 *
 * Every server render of the page (a `router.refresh()` after an edit, a
 * revalidation) replaces the first batch at once and re-reads the batches
 * after it in the background, so an edit to a row far down the list shows
 * without the list losing its place. The page tells a new render from an old
 * one by the `renderId` it stamps on the first batch (`stampServerRender` in
 * ./server-render.ts), not by comparing rows: an edit in the third batch
 * leaves the first one as it was. A client re-render, and Back to a page the
 * router kept, hand over the same stamp and read nothing. A new key (another
 * filter, search or sort) starts at the first batch again.
 */

export type InfinitePage<Row, Cursor> = {
  rows: Row[]
  /** Where the next batch starts; null at the end of the list. */
  nextCursor: Cursor | null
  /** How many rows the whole list has. Only the first batch needs to carry it. */
  total?: number
}

/**
 * The first batch as a server page hands it over: stamped with an id that is
 * new on every server render of the page (see ./server-render.ts).
 */
export type ServerBatch<P> = P & { renderId: string }

type Pages<P> = InfiniteData<P, unknown>

/** How long a batch may take before the list stops waiting and offers Retry. */
const BATCH_TIMEOUT_MS = 20_000

/** The server render each list last showed, to tell a new render from a re-render. */
const seenRender = new Map<string, string>()

const rowId = (row: { id: string }) => row.id

export function useInfiniteRows<
  Row extends { id: string },
  Cursor,
  P extends InfinitePage<Row, Cursor> = InfinitePage<Row, Cursor>,
>({
  queryKey,
  initial,
  fetchPage,
  rowKey = rowId,
}: {
  queryKey: readonly unknown[]
  /** The first batch, as the server rendered it. */
  initial: ServerBatch<P>
  /** One batch: the first when `cursor` is null. */
  fetchPage: (cursor: Cursor | null) => Promise<ActionResult<P>>
  /**
   * What tells one row from another in this list, when the id alone does not
   * (a list of several kinds of document, each numbering its own). Keep it a
   * stable function, defined outside the component.
   */
  rowKey?: (row: Row) => string
}) {
  const queryClient = useQueryClient()
  const listKey = JSON.stringify(queryKey)

  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  }, [fetchPage])

  const query = useInfiniteQuery<P, Error, Pages<P>, readonly unknown[], Cursor | null>({
    queryKey,
    initialPageParam: null,
    initialData: { pages: [initial], pageParams: [null] },
    queryFn: async ({ pageParam }) => {
      // An action that cannot reach the server throws instead of answering,
      // and one that never answers is given up on, so the list offers Retry
      // rather than placeholders for ever.
      let timer: ReturnType<typeof setTimeout> | undefined
      const giveUp = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), BATCH_TIMEOUT_MS)
      })
      const result = await Promise.race([
        fetchRef.current(pageParam as Cursor | null).catch(() => null),
        giveUp,
      ]).finally(() => clearTimeout(timer))
      if (!result?.success || !result.data) throw new Error(result?.error || 'load failed')
      return result.data
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // The server page says when the list changed (see below); nothing here
    // re-reads on its own, so a Back press never sets off a burst of batches.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // One quiet second try before the list says it could not load more.
    retry: 1,
    retryDelay: 500,
  })

  // A new server render, or another list. Runs before paint, so neither
  // shows a frame of the old rows.
  const previousKey = useRef<{ key: string; queryKey: readonly unknown[] } | null>(null)
  const renderId = initial.renderId
  useLayoutEffect(() => {
    const left = previousKey.current
    const keyChanged = left !== null && left.key !== listKey
    previousKey.current = { key: listKey, queryKey }
    if (keyChanged) {
      // The list left behind is let go, so coming back to that filter later
      // starts at its top rather than wherever it was scrolled to.
      queryClient.removeQueries({ queryKey: left.queryKey, exact: true })
      seenRender.delete(left.key)
    }
    const fresh = seenRender.get(listKey) !== renderId
    seenRender.set(listKey, renderId)
    const cached = queryClient.getQueryData<Pages<P>>(queryKey)

    if (keyChanged || !cached || cached.pages.length <= 1) {
      // Another filter, search or sort starts over at the first batch.
      if (
        cached &&
        (cached.pages.length > 1 || ((fresh || keyChanged) && cached.pages[0] !== initial))
      ) {
        queryClient.setQueryData<Pages<P>>(queryKey, { pages: [initial], pageParams: [null] })
      }
      return
    }
    // A client re-render, or Back to a page the router kept: the rows on
    // screen are the ones this render was made with.
    if (!fresh) return
    // The same list rendered again on the server: show its first batch now
    // and bring the rest up to date behind it, whether or not the first
    // batch changed, since an edit may be in any of them.
    queryClient.setQueryData<Pages<P>>(queryKey, {
      pages: [initial, ...cached.pages.slice(1)],
      pageParams: cached.pageParams,
    })
    void queryClient.refetchQueries({ queryKey, exact: true })
  }, [listKey, renderId, initial, queryClient])

  const pages = query.data?.pages ?? [initial]
  const rows = useMemo(() => {
    // Batches re-read in the background can overlap the ones around them for
    // a moment; a row is only ever shown once.
    const seen = new Set<string>()
    const out: Row[] = []
    for (const page of pages) {
      for (const row of page.rows) {
        const key = rowKey(row)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(row)
      }
    }
    return out
  }, [pages, rowKey])

  const firstPage = pages[0]
  const total = firstPage.total ?? rows.length
  const hasMore = query.hasNextPage
  const failed = query.isFetchNextPageError
  const { fetchNextPage, isFetching } = query

  // Footers report whether the end of the list is near. A page can have more
  // than one (the phone cards and the desktop table); only the one on screen
  // ever says yes.
  // What a footer said belongs to the list it was said about: the end of the
  // last list being in sight says nothing about the one that replaced it.
  // A new list also gives footers a new `reportNearEnd`, which makes them
  // look again.
  const [nearEnd, setNearEnd] = useState<{ key: string; slots: Record<string, boolean> }>({
    key: listKey,
    slots: {},
  })
  const reportNearEnd = useCallback(
    (slot: string, near: boolean) => {
      setNearEnd((current) => {
        if (current.key !== listKey)
          return near ? { key: listKey, slots: { [slot]: true } } : current
        if (current.slots[slot] === near) return current
        return { key: listKey, slots: { ...current.slots, [slot]: near } }
      })
    },
    [listKey]
  )
  const isNearEnd = nearEnd.key === listKey && Object.values(nearEnd.slots).some(Boolean)

  // Keeps loading while the end stays in sight: a tall screen can need two
  // batches before the list reaches past it. A failed batch waits for Retry.
  // The batch count is a dependency of its own because a quick answer can
  // start and finish a fetch between two renders.
  const batches = pages.length
  useEffect(() => {
    if (isNearEnd && hasMore && !isFetching && !failed) void fetchNextPage()
  }, [isNearEnd, hasMore, isFetching, failed, fetchNextPage, batches])

  const retry = useCallback(() => void fetchNextPage(), [fetchNextPage])

  return {
    rows,
    total,
    /** The first batch, with whatever else the server sends alongside it. */
    firstPage,
    /** Every batch loaded so far, for what later batches send alongside their rows. */
    pages,
    hasMore,
    /** More than the first batch has been loaded. */
    grown: pages.length > 1,
    loadingMore: query.isFetchingNextPage,
    failed,
    retry,
    reportNearEnd,
    /** Stable per list, for remembering where it was scrolled. */
    listKey,
  }
}

/** What a footer needs from the hook. */
export type InfiniteRowsState = {
  total: number
  hasMore: boolean
  grown: boolean
  loadingMore: boolean
  failed: boolean
  retry: () => void
  reportNearEnd: (slot: string, near: boolean) => void
  listKey: string
}
