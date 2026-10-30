/**
 * "Clear all" in the notification panel: it asks first, and on confirm it
 * empties the list, drops the badge, and tells the server to delete every
 * notification for the workshop.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPanel } from '@/features/notifications/Components/NotificationPanel'
import { useNotificationStore } from '@/features/notifications/store/notificationStore'

const deleteAllNotifications = vi.fn(async () => ({ success: true }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/features/notifications/Actions/notificationActions', () => ({
  markNotificationRead: vi.fn(async () => ({ success: true })),
  markAllNotificationsRead: vi.fn(async () => ({ success: true })),
  deleteNotification: vi.fn(async () => ({ success: true })),
  deleteAllNotifications: () => deleteAllNotifications(),
}))

function seed(count: number) {
  useNotificationStore.getState().setNotifications(
    Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      type: 'quote_accepted',
      title: `Quote ${i} accepted`,
      message: 'A customer accepted a quote',
      entityType: 'quote',
      entityId: `q${i}`,
      entityUrl: `/quotes/q${i}`,
      read: i % 2 === 0,
      organizationId: 'org1',
      createdAt: new Date().toISOString(),
    })),
    Math.floor(count / 2)
  )
  useNotificationStore.getState().setPanelOpen(true)
}

describe('NotificationPanel clear all', () => {
  beforeEach(() => {
    deleteAllNotifications.mockClear()
    useNotificationStore.getState().setNotifications([], 0)
  })

  it('removes every notification once confirmed', () => {
    seed(3)
    render(<NotificationPanel />)

    expect(screen.getAllByText(/^Quote \d accepted$/)).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('Remove all notifications?')).toBeInTheDocument()
    // Nothing is gone yet.
    expect(deleteAllNotifications).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteAllNotifications).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
    expect(useNotificationStore.getState().unreadCount).toBe(0)
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
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

  it('is hidden when there is nothing to clear', () => {
    useNotificationStore.getState().setPanelOpen(true)
    render(<NotificationPanel />)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })
})
