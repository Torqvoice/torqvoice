'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { z } from 'zod'
import { getPortalUnread } from '../../Actions/getPortalUnread'
import { portalUnreadKey, usePortalQueryClient } from './chatQuery'
import { usePortalLive } from './portalLive'

const unreadSchema = z.object({ unread: z.number().int().min(0) })

/**
 * How often a page asks whether the workshop has written: every half minute
 * on its own, and only as a safety net while the live line is open and says
 * so the moment it happens.
 */
const UNREAD_POLL_MS = 30_000
const UNREAD_POLL_LIVE_MS = 60_000

/**
 * How many messages from the workshop the customer has not opened, for the
 * badge on the Messages tab. Every theme's navigation reads it through
 * `usePortalNav`, so the badge is live wherever this hook is.
 *
 * It starts from what the server counted when the page was drawn. From then
 * on the portal's live line (portalLive.ts) says when the thread changed and
 * the count is read again at once; where that line cannot be opened it asks
 * every half minute while the tab is in front, as it always did. The chat itself writes
 * to the same place: opening the thread clears the badge at once, and its
 * own faster poll keeps the number current while it is on screen. A poll
 * that fails changes nothing: the badge keeps its last number.
 *
 * The app keeps what it has read while the customer moves between pages, so
 * a page the server has just drawn brings a newer count than the one kept:
 * that count wins the moment it arrives.
 */
export function usePortalUnread(orgParam: string, initial: number): number {
  const client = usePortalQueryClient()
  const live = usePortalLive(
    orgParam,
    useCallback(() => {
      void client.invalidateQueries({ queryKey: portalUnreadKey(orgParam) })
    }, [client, orgParam])
  )
  const { data } = useQuery(
    {
      queryKey: portalUnreadKey(orgParam),
      queryFn: async () => {
        const result = await getPortalUnread()
        if (!result.success || !result.data) throw new Error(result.error ?? 'unread')
        return unreadSchema.parse(result.data).unread
      },
      initialData: initial,
      staleTime: UNREAD_POLL_MS / 2,
      refetchInterval: live ? UNREAD_POLL_LIVE_MS : UNREAD_POLL_MS,
      // TanStack pauses an interval while the tab is hidden.
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: false,
    },
    client
  )
  // What the server counted for this page replaces what was kept from the
  // last one. Until that is written, the server's number is the one shown.
  const adopted = useRef<number | null>(null)
  useEffect(() => {
    client.setQueryData(portalUnreadKey(orgParam), initial)
    adopted.current = initial
  }, [client, orgParam, initial])
  return adopted.current === initial ? data : initial
}
