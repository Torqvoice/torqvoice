/**
 * Deleting one notification in the panel: it goes at once, and the server is
 * told. A delete that the server refuses, or that never reaches it, puts the
 * notification back where it was and says so. It used to stay gone until the
 * next reload brought it back.
 *
 * Opening a notification marks it read as bookkeeping nobody waits on, so a
 * failure there stays quiet rather than surfacing as a lost connection. Mark
 * all read that fails shows the notifications unread again.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPanel } from '@/features/notifications/Components/NotificationPanel'
import { useNotificationStore } from '@/features/notifications/store/notificationStore'

const deleteNotification = vi.fn(async (_id: string) => ({ success: true }))
const markNotificationRead = vi.fn(async (_id: string) => ({ success: true }))
const markAllNotificationsRead = vi.fn(async () => ({ success: true }))
type Fresh = { notifications: ReturnType<typeof makeNotifications>; unreadCount: number } | null
const getNotifications = vi.fn(async () => ({ success: true, data: null as Fresh }))
const deleteAllNotifications = vi.fn(async (_before: string) => ({ success: true }))
const toastError = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: (...args: unknown[]) => toastError(...args) }),
}))

// Async wrappers, as the real actions are: each call hands the panel a promise
// of its own. Vitest watches the promise a mock returns, which would count as
// handling a rejection the panel itself let go.
vi.mock('@/features/notifications/Actions/notificationActions', () => ({
  getNotifications: async () => getNotifications(),
  markNotificationRead: async (id: string) => markNotificationRead(id),
  markAllNotificationsRead: async () => markAllNotificationsRead(),
  deleteNotification: async (id: string) => deleteNotification(id),
  deleteAllNotifications: async (before: string) => deleteAllNotifications(before),
}))

/** What a browser's fetch throws when the request never reached the server. */
const offline = () => new TypeError('Failed to fetch')

function makeNotifications(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: 'quote_accepted',
    title: `Quote ${i} accepted`,
    message: 'A customer accepted a quote',
    entityType: 'quote',
    entityId: `q${i}`,
    entityUrl: `/quotes/q${i}`,
    // Only the middle one of three is unread.
    read: i !== 1,
    organizationId: 'org1',
    // Newest first, a minute apart.
    createdAt: new Date(Date.UTC(2026, 9, 30, 12, 59 - i)).toISOString(),
  }))
}

function seed() {
  useNotificationStore.getState().setNotifications(makeNotifications(3), 1)
  useNotificationStore.getState().setPanelOpen(true)
}

/** A request held open until the test answers it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const titles = () => screen.getAllByText(/^Quote \d accepted$/).map((el) => el.textContent)

/** Presses the row's X, then Delete on the question it asks. */
async function deleteRow(title: string) {
  const row = screen.getByText(title).closest('[role="button"]') as HTMLElement
  fireEvent.click(within(row).getAllByRole('button')[0])
  expect(within(row).getByText('Are you sure?')).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
  })
}

/** Long enough for Node to report a rejection that nothing handled. */
const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })

describe('NotificationPanel delete', () => {
  const unhandled = vi.fn()

  beforeEach(() => {
    deleteNotification.mockReset()
    deleteNotification.mockResolvedValue({ success: true })
    markNotificationRead.mockReset()
    markNotificationRead.mockResolvedValue({ success: true })
    markAllNotificationsRead.mockReset()
    markAllNotificationsRead.mockResolvedValue({ success: true })
    getNotifications.mockReset()
    getNotifications.mockResolvedValue({ success: true, data: null })
    deleteAllNotifications.mockReset()
    deleteAllNotifications.mockResolvedValue({ success: true })
    toastError.mockClear()
    unhandled.mockClear()
    process.on('unhandledRejection', unhandled)
    useNotificationStore.getState().setNotifications([], 0)
  })

  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  it('removes the notification and tells the server', async () => {
    seed()
    render(<NotificationPanel />)

    await deleteRow('Quote 1 accepted')

    expect(deleteNotification).toHaveBeenCalledWith('n1')
    expect(titles()).toEqual(['Quote 0 accepted', 'Quote 2 accepted'])
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('puts the notification back in its place and says so when the server refuses', async () => {
    seed()
    deleteNotification.mockResolvedValue({ success: false })
    render(<NotificationPanel />)

    await deleteRow('Quote 1 accepted')

    expect(titles()).toEqual(['Quote 0 accepted', 'Quote 1 accepted', 'Quote 2 accepted'])
    expect(useNotificationStore.getState().unreadCount).toBe(1)
    expect(toastError).toHaveBeenCalledWith('Could not delete the notification')
  })

  it('puts the notification back and says so when the request never arrives', async () => {
    seed()
    deleteNotification.mockRejectedValue(offline())
    render(<NotificationPanel />)

    await deleteRow('Quote 1 accepted')
    await settle()

    expect(titles()).toEqual(['Quote 0 accepted', 'Quote 1 accepted', 'Quote 2 accepted'])
    expect(useNotificationStore.getState().unreadCount).toBe(1)
    expect(toastError).toHaveBeenCalledWith('Could not delete the notification')
    // Handled here, so the lost-connection notice has nothing to add.
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('keeps a notification that arrived meanwhile above the one put back', async () => {
    seed()
    let fail: (reason: unknown) => void = () => undefined
    deleteNotification.mockReturnValue(
      new Promise<{ success: boolean }>((_resolve, reject) => {
        fail = reject
      })
    )
    render(<NotificationPanel />)

    await deleteRow('Quote 0 accepted')
    act(() => {
      useNotificationStore.getState().addNotification({
        ...makeNotifications(1)[0],
        id: 'n9',
        title: 'Quote 9 accepted',
        read: false,
        createdAt: new Date(Date.UTC(2026, 9, 30, 13, 5)).toISOString(),
      })
    })
    await act(async () => {
      fail(offline())
    })

    expect(titles()).toEqual([
      'Quote 9 accepted',
      'Quote 0 accepted',
      'Quote 1 accepted',
      'Quote 2 accepted',
    ])
    // The middle one of the first three, and the new arrival.
    expect(useNotificationStore.getState().unreadCount).toBe(2)
  })

  it('stays quiet when opening a notification cannot mark it read', async () => {
    seed()
    markNotificationRead.mockRejectedValue(offline())
    render(<NotificationPanel />)

    fireEvent.click(screen.getByText('Quote 1 accepted'))
    // Past the pause before the panel navigates, so nothing is left running.
    await settle(350)

    expect(markNotificationRead).toHaveBeenCalledWith('n1')
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(unhandled).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('marks all read', async () => {
    seed()
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await settle()

    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true)
  })

  it('shows them unread again when mark all read cannot reach the server', async () => {
    seed()
    markAllNotificationsRead.mockRejectedValue(offline())
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await settle()

    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().unreadCount).toBe(1)
    expect(
      useNotificationStore
        .getState()
        .notifications.filter((n) => !n.read)
        .map((n) => n.id)
    ).toEqual(['n1'])
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('shows them unread again when the server refuses mark all read', async () => {
    seed()
    markAllNotificationsRead.mockResolvedValue({ success: false })
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await settle()

    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  it('counts every unread one again when mark all read fails after new ones pushed some off the list', async () => {
    // A full list of 50 unread; one more arriving pushes the oldest off the
    // end of the list, but it is still unread on the server.
    const full = makeNotifications(50).map((n) => ({ ...n, read: false }))
    useNotificationStore.getState().setNotifications(full, 50)
    useNotificationStore.getState().setPanelOpen(true)
    const markAll = deferred<{ success: boolean }>()
    markAllNotificationsRead.mockReturnValue(markAll.promise)
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    act(() => {
      useNotificationStore.getState().addNotification({
        ...full[0],
        id: 'n99',
        title: 'Quote 99 accepted',
        createdAt: new Date(Date.UTC(2026, 9, 30, 13, 5)).toISOString(),
      })
    })
    await act(async () => {
      markAll.reject(offline())
    })
    await settle()

    expect(useNotificationStore.getState().unreadCount).toBe(51)
  })

  it('does not bring back a notification that clear all removed while its delete was out', async () => {
    seed()
    const del = deferred<{ success: boolean }>()
    deleteNotification.mockReturnValue(del.promise)
    getNotifications.mockResolvedValue({
      success: true,
      data: { notifications: [], unreadCount: 0 },
    })
    render(<NotificationPanel />)

    await deleteRow('Quote 1 accepted')
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })
    await act(async () => {
      del.reject(offline())
    })
    await settle()

    expect(screen.queryByText(/^Quote \d accepted$/)).not.toBeInTheDocument()
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(toastError).toHaveBeenCalledWith('Could not delete the notification')
  })

  it('does not bring back a notification that clear all removed, when clear all answers last', async () => {
    seed()
    const del = deferred<{ success: boolean }>()
    const clear = deferred<{ success: boolean }>()
    deleteNotification.mockReturnValue(del.promise)
    deleteAllNotifications.mockReturnValue(clear.promise)
    getNotifications.mockResolvedValue({
      success: true,
      data: { notifications: [], unreadCount: 0 },
    })
    render(<NotificationPanel />)

    await deleteRow('Quote 1 accepted')
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })
    await act(async () => {
      del.reject(offline())
    })
    // Not put back while clear all is still out.
    expect(screen.queryByText(/^Quote \d accepted$/)).not.toBeInTheDocument()
    await act(async () => {
      clear.resolve({ success: true })
    })
    await settle()

    expect(screen.queryByText(/^Quote \d accepted$/)).not.toBeInTheDocument()
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(toastError).toHaveBeenCalledWith('Could not delete the notification')
  })

  it('does not undo a later mark all read that succeeded when an earlier one fails', async () => {
    seed()
    const first = deferred<{ success: boolean }>()
    markAllNotificationsRead.mockReturnValueOnce(first.promise)
    markAllNotificationsRead.mockResolvedValueOnce({ success: true })
    const allRead = makeNotifications(3).map((n) => ({ ...n, read: true }))
    getNotifications.mockResolvedValue({
      success: true,
      data: { notifications: allRead, unreadCount: 0 },
    })
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    // A new one arrives, which brings the button back.
    act(() => {
      useNotificationStore.getState().addNotification({
        ...makeNotifications(1)[0],
        id: 'n9',
        title: 'Quote 9 accepted',
        read: false,
        createdAt: new Date(Date.UTC(2026, 9, 30, 13, 5)).toISOString(),
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    })
    await act(async () => {
      first.reject(offline())
    })
    await settle()

    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument()
  })
})
