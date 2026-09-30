'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { CollaborationManager, type ManagerState } from './manager'

/**
 * Hands the page its collaboration manager, and nothing else.
 *
 * The app used to open five sockets, one per feature. There is one now, and
 * it lives in `CollaborationManager`: this component only decides when the
 * manager runs (while the app shell is mounted) and makes it reachable.
 *
 * What is in the context is the manager itself, which is the same object for
 * the life of the tab. That matters more than it looks: a context value that
 * changed whenever the connection did would re-run every effect that depends
 * on it, and each of those is a room left and joined again for no reason.
 * Connection state is read separately, through `useRealtimeState`, by the few
 * things that draw it.
 */

const RealtimeContext = createContext<CollaborationManager | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new CollaborationManager())

  // Children's effects run before this one, so by the time the socket opens
  // the manager already knows what the page wants. In development React runs
  // this twice: `stop` then `start` is one socket closed and one opened, with
  // everything the page asked for kept across it.
  useEffect(() => {
    manager.start()
    return () => manager.stop()
  }, [manager])

  return <RealtimeContext.Provider value={manager}>{children}</RealtimeContext.Provider>
}

/**
 * Quiet without a provider, on purpose: live updates are how a page stays
 * current, never how it works. A page rendered outside the app shell, or in a
 * test, renders and simply does not update by itself.
 */
export function useRealtime(): CollaborationManager | null {
  return useContext(RealtimeContext)
}

const OFFLINE: ManagerState = { status: 'idle', me: null }
const nothingToWatch = () => () => undefined
const offline = () => OFFLINE

/** Whether the link is up, and who this browser is signed in as. */
export function useRealtimeState(): ManagerState {
  const manager = useRealtime()
  return useSyncExternalStore(
    manager ? manager.watchState : nothingToWatch,
    manager ? manager.getState : offline,
    offline
  )
}
