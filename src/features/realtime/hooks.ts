'use client'

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  recordRoom,
  type PresenceUser,
  type RecordChange,
  type RecordKind,
} from '@/lib/realtime/events'
import type { Me } from './manager'
import { useRealtime, useRealtimeState } from './RealtimeProvider'
import { createRefreshGovernor } from './refresh-governor'

/**
 * What a page uses. Everything here is a thin layer over the collaboration
 * manager, and every one of them is safe to call when there is no provider:
 * the page renders, and does not update by itself.
 *
 * Making a new kind of page collaborative is two lines: `useLiveRecord` to
 * stay current, and `<PresenceChips>` to show who else is there.
 */

/**
 * Tells you when this record changed somewhere else, and after a
 * reconnection, when something may have changed while the socket was down.
 *
 * The handler is called with the change for the first case and with `null`
 * for the second, because a resync has no single change to describe.
 */
export function useRecordChanges(
  kind: RecordKind,
  id: string | null | undefined,
  handler: (change: RecordChange | null) => void
): void {
  const realtime = useRealtime()
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  }, [handler])

  useEffect(() => {
    if (!realtime || !id) return
    const stopWatching = realtime.watch(recordRoom(kind, id), (change) => ref.current(change))
    const stopResync = realtime.onResync(() => ref.current(null))
    return () => {
      stopWatching()
      stopResync()
    }
  }, [realtime, kind, id])
}

/**
 * Whether a change is this page's own save coming back, which it must not
 * answer: the page has already shown the result, and re-reading would fight
 * the form somebody is typing in.
 *
 * Only a change from another web page of the same person can be that. One
 * from the technician app is never an echo of a browser, whoever is signed
 * in on the phone, and a one-person shop is signed in on both: for a while
 * the desk ignored its own phone finishing a job, because the check read the
 * user and not the source, and the phone holds no presence to say it is a
 * second device.
 *
 * Between two of the person's own web pages, presence decides: a save on the
 * laptop has to reach their own tablet in the bay, and the room's `devices`
 * count says whether there is one.
 */
export function isOwnEcho(
  change: RecordChange,
  me: Me | null | undefined,
  presence: PresenceUser[] | undefined
): boolean {
  if (change.by.source !== 'web') return false
  if (!change.by.userId || !me || change.by.userId !== me.userId) return false
  const mine = presence?.find((user) => user.userId === me.userId)
  return !mine || mine.devices < 2
}

/**
 * The record kept current on screen: re-read the page's own server data when
 * it changes somewhere else.
 *
 * Your own changes are skipped, because the page that made them has already
 * shown the result and re-reading would fight the form somebody is typing in.
 * When and how often the re-read happens is the governor's decision
 * (refresh-governor.ts), which is what makes it impossible for this hook to
 * turn into a page that polls.
 */
export function useLiveRecord(
  kind: RecordKind,
  id: string | null | undefined,
  options: { onChange?: (change: RecordChange | null) => void } = {}
): void {
  const router = useRouter()
  const realtime = useRealtime()
  const onChange = useRef(options.onChange)
  useEffect(() => {
    onChange.current = options.onChange
  }, [options.onChange])

  const governor = useRef<ReturnType<typeof createRefreshGovernor> | null>(null)
  useEffect(() => {
    const created = createRefreshGovernor({
      refresh: () => router.refresh(),
      onPressure: (gapMs) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[realtime] ${kind}:${id} is changing unusually often; re-reading every ${gapMs} ms`
          )
        }
      },
    })
    governor.current = created
    const onVisible = () => {
      if (document.visibilityState === 'visible') created.visible()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      created.dispose()
      governor.current = null
    }
  }, [router, kind, id])

  useRecordChanges(
    kind,
    id,
    useCallback(
      (change) => {
        if (
          change &&
          id &&
          isOwnEcho(change, realtime?.getState().me, realtime?.presenceOf(recordRoom(kind, id)))
        ) {
          return
        }
        onChange.current?.(change)
        governor.current?.request()
      },
      [realtime, kind, id]
    )
  )
}

const NOBODY: PresenceUser[] = []
const nothingToWatch = () => () => undefined

/**
 * Who else has this record open.
 *
 * Standing in the room is what makes this browser appear in everyone else's
 * chips, so a page that only wants to watch changes should use
 * `useRecordChanges` and not this. Leaving happens on unmount, and on the
 * socket closing. Any number of components may call this for one record:
 * the manager counts them, and the server sees one person.
 */
export function useRecordPresence(
  kind: RecordKind,
  id: string | null | undefined
): { others: PresenceUser[]; me: Me | null } {
  const realtime = useRealtime()
  const { me } = useRealtimeState()
  const room = id ? recordRoom(kind, id) : null

  useEffect(() => {
    if (!realtime || !room) return
    return realtime.join(room)
  }, [realtime, room])

  const subscribe = useMemo(
    () =>
      realtime && room
        ? (onChange: () => void) => realtime.watchPresence(room, onChange)
        : nothingToWatch,
    [realtime, room]
  )

  const everyone = useSyncExternalStore(
    subscribe,
    () => (realtime && room ? realtime.presenceOf(room) : NOBODY),
    () => NOBODY
  )

  const others = useMemo(
    () => everyone.filter((user) => user.userId !== me?.userId),
    [everyone, me?.userId]
  )
  return { others, me }
}
