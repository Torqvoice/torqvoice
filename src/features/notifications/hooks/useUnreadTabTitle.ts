'use client'

import { useEffect } from 'react'
import { useNotificationStore } from '../store/notificationStore'

const BADGE = /^\(\d+\+?\) /

/** The browser tab's title with the unread count in front, or without one at zero. */
export function badgedTitle(title: string, unreadCount: number): string {
  const bare = title.replace(BADGE, '')
  if (unreadCount <= 0) return bare
  return `(${unreadCount > 99 ? '99+' : unreadCount}) ${bare}`
}

/**
 * Puts the unread count in the browser tab, the way a mail client does, so a
 * message that arrives while the workshop is on another tab is seen. Next
 * rewrites the title on every navigation, so the badge is re-applied
 * whenever the title changes, not only when the count does.
 */
export function useUnreadTabTitle(): void {
  const unreadCount = useNotificationStore((state) => state.unreadCount)

  useEffect(() => {
    const apply = () => {
      const wanted = badgedTitle(document.title, unreadCount)
      if (document.title !== wanted) document.title = wanted
    }
    apply()

    const title = document.querySelector('title')
    if (!title) return
    const observer = new MutationObserver(apply)
    observer.observe(title, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
      document.title = badgedTitle(document.title, 0)
    }
  }, [unreadCount])
}
