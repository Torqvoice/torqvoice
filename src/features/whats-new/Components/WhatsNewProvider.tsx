'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { loadMoreWhatsNew } from '../Actions/loadMoreWhatsNew'
import { markWhatsNewSeen } from '../Actions/markWhatsNewSeen'
import { rememberWhatsNewTabHidden } from '../Lib/tabPreference'
import type { WhatsNewEntry } from '../Schema/whatsNewSchema'
import { WhatsNewPanel } from './WhatsNewPanel'
import { WhatsNewTab } from './WhatsNewTab'

const Context = createContext<{
  /** False when there is nothing to show: the feed is empty, hidden or unreachable. */
  available: boolean
  hasUnread: boolean
  open: () => void
  /** Whether this browser has sent the tab on the edge of the screen away. */
  tabHidden: boolean
  setTabHidden: (hidden: boolean) => void
}>({
  available: false,
  hasUnread: false,
  open: () => undefined,
  tabHidden: false,
  setTabHidden: () => undefined,
})

export function useWhatsNew() {
  return useContext(Context)
}

/**
 * Holds the "What's new" panel for the signed-in app.
 *
 * One panel, here, rather than one per button: the tab on the edge of the
 * screen, the account menu and the update banner's link all open it, and
 * they sit in different parts of the layout. The entries arrive from the server with the page, so opening the
 * panel never waits on the network.
 */
export function WhatsNewProvider({
  entries,
  hasMore: initialHasMore = false,
  unreadIds,
  initialTabHidden = false,
  timeZone,
  appVersion,
  releaseNotesUrl,
  feedback,
  children,
}: {
  /** The newest highlights: the first page, sent with the page itself. */
  entries: WhatsNewEntry[]
  /** Whether there are older ones the panel can ask for. */
  hasMore?: boolean
  /** Entries published since this person last opened the panel. */
  unreadIds: string[]
  /** This browser's remembered choice, read from its cookie on the server. */
  initialTabHidden?: boolean
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
  const t = useTranslations('common.whatsNew')
  const [isOpen, setIsOpen] = useState(false)
  const [tabHidden, setTabHiddenState] = useState(initialTabHidden)
  const setTabHidden = useCallback((hidden: boolean) => {
    setTabHiddenState(hidden)
    rememberWhatsNewTabHidden(hidden)
  }, [])
  // What has been acknowledged in this tab. The server's list catches up on
  // the next navigation; until then this is what clears the dot at once.
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set())
  // The entries that were news when the panel was last opened. They keep
  // their marker while it is being read, which is the whole point of one.
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set())

  // Older entries the reader has scrolled to. Thrown away when the first
  // page changes, because offsets into the old list no longer mean anything.
  const firstPageKey = entries.map((entry) => entry.id).join(',')
  const [older, setOlder] = useState<WhatsNewEntry[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    setOlder([])
    setHasMore(initialHasMore)
  }, [firstPageKey, initialHasMore])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const result = await loadMoreWhatsNew(entries.length + older.length)
    setLoadingMore(false)
    if (!result.success || !result.data) return
    const known = new Set([...entries, ...older].map((entry) => entry.id))
    const fresh = result.data.entries.filter((entry) => !known.has(entry.id))
    setOlder((current) => [...current, ...fresh])
    // Nothing new came back: stop asking rather than ask forever.
    setHasMore(result.data.hasMore && fresh.length > 0)
  }, [loadingMore, hasMore, entries, older])

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
    () => ({
      available: entries.length > 0,
      hasUnread: pending.length > 0,
      open,
      tabHidden,
      setTabHidden,
    }),
    [entries.length, pending.length, open, tabHidden, setTabHidden]
  )

  return (
    <Context.Provider value={value}>
      {children}
      {entries.length > 0 && !tabHidden && (
        <WhatsNewTab
          hasUnread={pending.length > 0}
          onOpen={open}
          onHide={() => {
            setTabHidden(true)
            // Said once, at the moment it goes, so the way back is known.
            toast(t('tabHidden'))
          }}
        />
      )}
      {entries.length > 0 && (
        <WhatsNewPanel
          open={isOpen}
          onOpenChange={setIsOpen}
          entries={older.length > 0 ? [...entries, ...older] : entries}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
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
