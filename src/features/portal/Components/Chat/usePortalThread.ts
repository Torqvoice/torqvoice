'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPortalThread } from '../../Actions/getPortalThread'
import { markPortalMessagesRead } from '../../Actions/markPortalMessagesRead'
import { sendPortalMessage } from '../../Actions/sendPortalMessage'
import {
  PORTAL_CHAT_ERRORS,
  PORTAL_THREAD_MAX,
  PORTAL_THREAD_STEP,
  type PortalThread,
  portalChatMessageSchema,
  portalThreadSchema,
} from '../../Lib/chatTypes'
import { portalThreadKey, portalUnreadKey, usePortalQueryClient } from './chatQuery'
import type { PortalOutgoing } from './chatThread'
import { usePortalLive } from './portalLive'

/**
 * How often the thread asks for news while it is on screen: every five
 * seconds on its own, and once a minute as a safety net while the live line
 * is open, since that says so the moment something changes.
 */
const THREAD_POLL_MS = 5_000
const THREAD_POLL_LIVE_MS = 60_000

/**
 * The customer's thread, kept current, and everything that changes it: the
 * poll, sending (shown at once, confirmed or marked failed afterwards),
 * trying a failed message again, reading earlier messages, and telling the
 * workshop its messages were seen.
 *
 * The portal's live line (portalLive.ts) says when the thread changed, and
 * the thread is read again at once: a reply from the workshop is on screen
 * as it is sent. Where that line cannot be opened, the poll alone keeps the
 * thread current, as it always could.
 *
 * Nothing runs while the chat is not visible: no poll, no read receipt. A
 * signal that arrives meanwhile is kept, and the thread is read the moment
 * the chat shows. A
 * poll that fails leaves the thread as it was and tries again on the next
 * beat; it never throws into the page.
 */
export function usePortalThread({
  orgParam,
  initial,
  visible,
}: {
  orgParam: string
  /** The thread as the server drew it. */
  initial: PortalThread
  visible: boolean
}) {
  const client = usePortalQueryClient()
  const queryKey = useMemo(() => portalThreadKey(orgParam), [orgParam])
  const limit = useRef(Math.max(initial.messages.length, PORTAL_THREAD_STEP))
  const [outgoing, setOutgoing] = useState<PortalOutgoing[]>([])
  const [loadingEarlier, setLoadingEarlier] = useState(false)

  // Sends on their way. The customer's own message comes back as a signal
  // a moment before the send itself answers; read then, the thread would
  // show the stored message beside the one still marked as sending. The
  // send reads the thread again itself when it lands.
  const sending = useRef(0)
  const live = usePortalLive(
    orgParam,
    useCallback(() => {
      if (sending.current > 0) return
      // Read again now if the chat is on screen; if it is hidden the query
      // is switched off, and being stale it reads when it is switched on.
      void client.invalidateQueries({ queryKey })
    }, [client, queryKey])
  )

  const query = useQuery(
    {
      queryKey,
      queryFn: async (): Promise<PortalThread> => {
        const result = await getPortalThread(orgParam, limit.current)
        if (!result.success || !result.data) throw new Error(result.error ?? 'thread')
        // Checked before it is drawn: a newer server answering an older tab
        // must fail here, as a poll that failed, and not inside the thread.
        const thread = portalThreadSchema.parse(result.data)
        client.setQueryData(portalUnreadKey(orgParam), thread.unread)
        return thread
      },
      initialData: initial,
      // What the server drew is already old: ask as soon as the chat shows.
      initialDataUpdatedAt: 0,
      enabled: visible,
      refetchInterval: live ? THREAD_POLL_LIVE_MS : THREAD_POLL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: false,
    },
    client
  )
  const thread = query.data

  /** Puts a confirmed message into the thread without waiting for the poll. */
  const adopt = useCallback(
    async (raw: unknown) => {
      const parsed = portalChatMessageSchema.safeParse(raw)
      // A poll already on its way was read before the message existed, and
      // would take it out of the thread again when it lands.
      await client.cancelQueries({ queryKey })
      if (parsed.success) {
        client.setQueryData<PortalThread>(queryKey, (old) =>
          old
            ? {
                ...old,
                messages: [
                  ...old.messages.filter((message) => message.id !== parsed.data.id),
                  parsed.data,
                ],
              }
            : old
        )
      }
      void client.invalidateQueries({ queryKey })
    },
    [client, queryKey]
  )

  const deliver = useCallback(
    async (entry: PortalOutgoing) => {
      // An action that cannot reach the server throws instead of answering.
      sending.current += 1
      const result = await sendPortalMessage({
        body: entry.body,
        attachments: entry.attachments,
      })
        .catch(() => null)
        .finally(() => {
          sending.current -= 1
        })

      if (result?.success && result.data) {
        await adopt(result.data)
        setOutgoing((list) => list.filter((one) => one.localId !== entry.localId))
        for (const preview of entry.previews) URL.revokeObjectURL?.(preview.url)
        return
      }

      const problem = (PORTAL_CHAT_ERRORS as readonly string[]).includes(result?.error ?? '')
        ? (result?.error ?? null)
        : null
      if (problem === 'chat_off') {
        client.setQueryData<PortalThread>(queryKey, (old) =>
          old ? { ...old, enabled: false } : old
        )
      }
      setOutgoing((list) =>
        list.map((one) =>
          one.localId === entry.localId ? { ...one, state: 'failed', problem } : one
        )
      )
    },
    [adopt, client, queryKey]
  )

  const send = useCallback(
    (message: Pick<PortalOutgoing, 'body' | 'previews' | 'attachments'>) => {
      const entry: PortalOutgoing = {
        ...message,
        localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        state: 'sending',
        problem: null,
      }
      setOutgoing((list) => [...list, entry])
      void deliver(entry)
    },
    [deliver]
  )

  const retry = useCallback(
    (localId: string) => {
      const entry = outgoing.find((one) => one.localId === localId)
      if (!entry || entry.state !== 'failed') return
      const again: PortalOutgoing = { ...entry, state: 'sending', problem: null }
      setOutgoing((list) => list.map((one) => (one.localId === localId ? again : one)))
      void deliver(again)
    },
    [deliver, outgoing]
  )

  const discard = useCallback((localId: string) => {
    setOutgoing((list) => {
      const entry = list.find((one) => one.localId === localId)
      for (const preview of entry?.previews ?? []) URL.revokeObjectURL?.(preview.url)
      return list.filter((one) => one.localId !== localId)
    })
  }, [])

  const { refetch } = query
  const showEarlier = useCallback(async () => {
    if (loadingEarlier) return
    const before = limit.current
    limit.current = Math.min(before + PORTAL_THREAD_STEP, PORTAL_THREAD_MAX)
    setLoadingEarlier(true)
    try {
      const result = await refetch()
      // Nothing came: the next press asks for the same page again.
      if (result.isError) limit.current = before
    } finally {
      setLoadingEarlier(false)
    }
  }, [loadingEarlier, refetch])

  // The workshop's messages are read once they are in front of the customer:
  // the ones in the thread as it is drawn, by id. One that arrives after
  // this read of the thread, or an older one not loaded yet, is not on
  // screen and stays unread until it is.
  // As one string, so the effect below runs when the set changes and not on
  // every poll that brings the same messages in a new array.
  const shownUnreadKey = useMemo(
    () =>
      thread.messages
        .filter((message) => message.direction === 'outbound' && !message.readAt)
        .map((message) => message.id)
        .join(','),
    [thread.messages]
  )
  const marked = useRef<string | null>(null)
  useEffect(() => {
    if (!visible || !shownUnreadKey || marked.current === shownUnreadKey) return
    marked.current = shownUnreadKey
    const ids = shownUnreadKey.split(',')
    const forget = () => {
      // Not told: the next change of the thread tries again.
      if (marked.current === shownUnreadKey) marked.current = null
    }
    markPortalMessagesRead({ ids })
      .then((result) => {
        if (!result.success || !result.data) return forget()
        const now = new Date().toISOString()
        // What is still unread is the server's count: messages that came in
        // meanwhile, and older ones above what is loaded.
        const unread = result.data.unread
        client.setQueryData<PortalThread>(queryKey, (old) =>
          old
            ? {
                ...old,
                unread,
                messages: old.messages.map((message) =>
                  ids.includes(message.id) && !message.readAt
                    ? { ...message, readAt: now }
                    : message
                ),
              }
            : old
        )
        client.setQueryData(portalUnreadKey(orgParam), unread)
      })
      .catch(forget)
  }, [visible, shownUnreadKey, client, queryKey, orgParam])

  return {
    thread,
    outgoing,
    send,
    retry,
    discard,
    showEarlier,
    loadingEarlier,
    /** Earlier messages can be asked for: there are some, and the cap is not reached. */
    canShowEarlier: thread.hasEarlier && thread.messages.length < PORTAL_THREAD_MAX,
  }
}
