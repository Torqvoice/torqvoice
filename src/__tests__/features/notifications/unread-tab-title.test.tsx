/**
 * The unread count in the browser tab: "(3) Messages · Torqvoice" while
 * something is unread, the plain title once nothing is, and never a badge on
 * top of a badge when the title is rewritten by a navigation.
 */
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { badgedTitle, useUnreadTabTitle } from '@/features/notifications/hooks/useUnreadTabTitle'
import { useNotificationStore } from '@/features/notifications/store/notificationStore'

function Badge() {
  useUnreadTabTitle()
  return null
}

describe('badgedTitle', () => {
  it('prefixes the count and strips an old one first', () => {
    expect(badgedTitle('Messages', 3)).toBe('(3) Messages')
    expect(badgedTitle('(2) Messages', 3)).toBe('(3) Messages')
    expect(badgedTitle('(3) Messages', 0)).toBe('Messages')
    expect(badgedTitle('Messages', 0)).toBe('Messages')
    expect(badgedTitle('Messages', 250)).toBe('(99+) Messages')
    expect(badgedTitle('(99+) Messages', 1)).toBe('(1) Messages')
  })

  it('leaves a title that happens to start with brackets alone', () => {
    expect(badgedTitle('(draft) Quote', 2)).toBe('(2) (draft) Quote')
  })
})

describe('useUnreadTabTitle', () => {
  afterEach(() => {
    act(() => useNotificationStore.getState().setNotifications([], 0))
    document.title = ''
  })

  it('follows the store, and takes the badge with it on unmount', () => {
    document.head.appendChild(document.createElement('title'))
    document.title = 'Dashboard'
    const view = render(<Badge />)
    expect(document.title).toBe('Dashboard')

    act(() => useNotificationStore.getState().setNotifications([], 2))
    expect(document.title).toBe('(2) Dashboard')

    act(() => useNotificationStore.getState().setNotifications([], 0))
    expect(document.title).toBe('Dashboard')

    act(() => useNotificationStore.getState().setNotifications([], 5))
    expect(document.title).toBe('(5) Dashboard')
    view.unmount()
    expect(document.title).toBe('Dashboard')
  })

  it('re-applies the badge after a navigation rewrites the title', async () => {
    document.title = 'Dashboard'
    render(<Badge />)
    act(() => useNotificationStore.getState().setNotifications([], 4))
    expect(document.title).toBe('(4) Dashboard')

    // What Next does on a route change: a new title, badge gone.
    document.title = 'Messages'
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.title).toBe('(4) Messages')
  })
})
