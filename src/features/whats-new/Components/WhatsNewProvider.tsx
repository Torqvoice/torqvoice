'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { markWhatsNewSeen } from '../Actions/markWhatsNewSeen'
import type { WhatsNewEntry } from '../Schema/whatsNewSchema'
import { WhatsNewPanel } from './WhatsNewPanel'

const Context = createContext<{
  /** False when there is nothing to show: the feed is empty, hidden or unreachable. */
  available: boolean
  hasUnread: boolean
  open: () => void
}>({ available: false, hasUnread: false, open: () => undefined })

export function useWhatsNew() {
  return useContext(Context)
}

/**
 * Holds the "What's new" panel for the signed-in app.
 *
 * One panel, here, rather than one per button: the header button and the
 * update banner's link both open it, and they sit in different parts of the
 * layout. The entries arrive from the server with the page, so opening the
 * panel never waits on the network.
 */
export function WhatsNewProvider({
  entries,
  unreadIds,
  timeZone,
  appVersion,
  releaseNotesUrl,
  feedback,
  children,
}: {
  entries: WhatsNewEntry[]
  /** Entries published since this person last opened the panel. */
  unreadIds: string[]
  timeZone: string
  appVersion: string
  releaseNotesUrl: string
  /**
   * Whether a vote can be sent, and what goes with it: on the cloud the
   * sender's email, so it can be answered; on a self-hosted install nothing
   * that names anybody. `null` where sending is switched off (the demo).
   */
  feedback: 'identified' | 'anonymous' | null
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  // What has been acknowledged in this tab. The server's list catches up on
  // the next navigation; until then this is what clears the dot at once.
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set())
  // The entries that were news when the panel was last opened. They keep
  // their marker while it is being read, which is the whole point of one.
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set())

  const pending = useMemo(
    () => unreadIds.filter((id) => !acknowledged.has(id)),
    [unreadIds, acknowledged]
  )

  const open = useCallback(() => {
    setIsOpen(true)
    if (pending.length === 0) return
    setMarked(new Set(pending))
    setAcknowledged((current) => new Set([...current, ...pending]))
    // Not recorded: let the dot come back, so the next opening tries again
    // rather than this tab believing something the server never heard.
    const forget = () =>
      setAcknowledged((current) => new Set([...current].filter((id) => !pending.includes(id))))
    markWhatsNewSeen()
      .then((result) => {
        if (!result.success) forget()
      })
      .catch(forget)
  }, [pending])

  const value = useMemo(
    () => ({ available: entries.length > 0, hasUnread: pending.length > 0, open }),
    [entries.length, pending.length, open]
  )

  return (
    <Context.Provider value={value}>
      {children}
      {entries.length > 0 && (
        <WhatsNewPanel
          open={isOpen}
          onOpenChange={setIsOpen}
          entries={entries}
          markedIds={marked}
          timeZone={timeZone}
          appVersion={appVersion}
          releaseNotesUrl={releaseNotesUrl}
          feedback={feedback}
        />
      )}
    </Context.Provider>
  )
}
