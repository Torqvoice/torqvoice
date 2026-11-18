/**
 * "Clear all" in the notification panel: it asks first; on confirm it empties
 * the list, drops the badge, and tells the server to delete everything up to
 * the newest notification that was on screen. A failed request puts the
 * server's list back and says so.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPanel } from '@/features/notifications/Components/NotificationPanel'
import { useNotificationStore } from '@/features/notifications/store/notificationStore'

const deleteAllNotifications = vi.fn(async (_before: string) => ({ success: true }))
const getNotifications = vi.fn(async () => ({
  success: true,
  data: { notifications: [] as ReturnType<typeof makeNotifications>, unreadCount: 0 },
}))
const toastError = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: (...args: unknown[]) => toastError(...args) }),
}))

vi.mock('@/features/notifications/Actions/notificationActions', () => ({
  getNotifications: () => getNotifications(),
  markNotificationRead: vi.fn(async () => ({ success: true })),
  markAllNotificationsRead: vi.fn(async () => ({ success: true })),
  deleteNotification: vi.fn(async () => ({ success: true })),
  deleteAllNotifications: (before: string) => deleteAllNotifications(before),
}))

function makeNotifications(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: 'quote_accepted',
    title: `Quote ${i} accepted`,
    message: 'A customer accepted a quote',
    entityType: 'quote',
    entityId: `q${i}`,
    entityUrl: `/quotes/q${i}`,
    read: i % 2 === 0,
    organizationId: 'org1',
    // Newest first, a minute apart.
    createdAt: new Date(Date.UTC(2026, 9, 30, 12, 59 - i)).toISOString(),
  }))
}

function seed(count: number) {
  useNotificationStore.getState().setNotifications(makeNotifications(count), Math.floor(count / 2))
  useNotificationStore.getState().setPanelOpen(true)
}

const flush = () =>
  act(async () => {
    await Promise.resolve()
  })

describe('NotificationPanel clear all', () => {
  beforeEach(() => {
    deleteAllNotifications.mockClear()
    deleteAllNotifications.mockResolvedValue({ success: true })
    getNotifications.mockClear()
    toastError.mockClear()
    useNotificationStore.getState().setNotifications([], 0)
  })

  it('removes every notification once confirmed, up to the newest shown', async () => {
    seed(3)
    render(<NotificationPanel />)

    expect(screen.getAllByText(/^Quote \d accepted$/)).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('Remove all notifications?')).toBeInTheDocument()
    // Nothing is gone yet.
    expect(deleteAllNotifications).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await flush()

    expect(deleteAllNotifications).toHaveBeenCalledTimes(1)
    expect(deleteAllNotifications).toHaveBeenCalledWith('2026-10-30T12:59:00.000Z')
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('puts the server list back and says so when the request fails', async () => {
    seed(2)
    deleteAllNotifications.mockResolvedValue({ success: false })
    getNotifications.mockResolvedValue({
      success: true,
      data: { notifications: makeNotifications(2), unreadCount: 1 },
    })
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await flush()

    expect(toastError).toHaveBeenCalledWith('Could not clear the notifications')
    expect(getNotifications).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().notifications).toHaveLength(2)
    expect(useNotificationStore.getState().unreadCount).toBe(1)
    expect(screen.getAllByText(/^Quote \d accepted$/)).toHaveLength(2)
  })

  it('cancel keeps everything', () => {
    seed(2)
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleteAllNotifications).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications).toHaveLength(2)
    expect(screen.queryByText('Remove all notifications?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('does nothing when the list emptied while the question was up', async () => {
    seed(1)
    render(<NotificationPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    // The one notification goes by its own delete control meanwhile.
    act(() => {
      useNotificationStore.getState().removeNotification('n0')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await flush()

    expect(deleteAllNotifications).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove all notifications?')).not.toBeInTheDocument()
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
  })

  it('is hidden when there is nothing to clear', () => {
    useNotificationStore.getState().setPanelOpen(true)
    render(<NotificationPanel />)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })
})
