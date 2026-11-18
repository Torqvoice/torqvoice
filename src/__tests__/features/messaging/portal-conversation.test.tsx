/**
 * A customer's portal thread in the workshop's inbox: what they wrote and
 * the photos they sent, an answer typed and sent with Enter, and a thread
 * that can be read but not answered once the portal's chat is turned off.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  getPortalConversation: vi.fn(),
  markPortalMessagesSeen: vi.fn(),
  sendPortalReply: vi.fn(),
}))
vi.mock('@/features/messaging/Actions/portalThreadActions', () => actions)
// The app's socket: the conversation follows the customer, and the test
// speaks for the server.
const realtime = vi.hoisted(() => ({
  handler: null as ((change: { hint?: string } | null) => void) | null,
  following: null as string | null,
}))
vi.mock('@/features/realtime/hooks', () => ({
  useRecordChanges: (
    kind: string,
    id: string,
    handler: (change: { hint?: string } | null) => void
  ) => {
    realtime.following = `${kind}:${id}`
    realtime.handler = handler
  },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import { PortalConversation } from '@/features/messaging/Components/PortalConversation'
import { isActiveConversation } from '@/features/messaging/activeConversation'
import { toast } from 'sonner'

const PHOTO = '/api/protected/files/org1/portal-uploads/11111111-1111-4111-8111-111111111111.jpg'
const inbound = {
  id: 'pm1',
  direction: 'inbound',
  body: 'The brake light came on this morning.',
  attachments: [{ url: PHOTO, kind: 'image' }],
  authorName: null,
  createdAt: '2026-11-14T08:05:00Z',
  readAt: null,
}
const thread = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    messages: [inbound],
    nextCursor: null,
    customerName: 'Kari Nordmann',
    canReply: true,
    ...over,
  },
})

const open = () =>
  render(<PortalConversation customerId="kari" customerName="Kari Nordmann" onSent={vi.fn()} />)

beforeEach(() => {
  vi.clearAllMocks()
  actions.getPortalConversation.mockResolvedValue(thread())
  actions.markPortalMessagesSeen.mockImplementation(async ({ ids }: { ids: string[] }) => ({
    success: true,
    data: { marked: ids.length },
  }))
})

describe('a portal thread in the inbox', () => {
  it('shows what the customer wrote and the photo they sent', async () => {
    open()
    expect(await screen.findByText('The brake light came on this morning.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Photo from Kari Nordmann' })).toHaveAttribute(
      'src',
      PHOTO
    )
    expect(actions.getPortalConversation).toHaveBeenCalledWith('kari')
  })

  it('is the conversation on screen, so a message for it does not ring the bell', async () => {
    open()
    await screen.findByText('The brake light came on this morning.')
    expect(isActiveConversation('/messages?channel=portal&customerId=kari')).toBe(true)
  })

  it('sends an answer on Enter and adds it to the thread', async () => {
    actions.sendPortalReply.mockResolvedValue({
      success: true,
      data: {
        customerName: 'Kari Nordmann',
        message: {
          id: 'pm2',
          direction: 'outbound',
          body: 'Bring it in today, we will have a look.',
          attachments: [],
          authorName: 'Jonas Berg',
          createdAt: '2026-11-14T08:10:00Z',
          readAt: null,
        },
      },
    })
    const user = userEvent.setup()
    open()
    const field = await screen.findByLabelText('Write to Kari Nordmann in the portal')
    await user.type(field, 'Bring it in today, we will have a look.{Enter}')

    expect(actions.sendPortalReply).toHaveBeenCalledWith({
      customerId: 'kari',
      body: 'Bring it in today, we will have a look.',
      attachments: [],
    })
    expect(await screen.findByText('Bring it in today, we will have a look.')).toBeInTheDocument()
    expect(screen.getByText('Jonas Berg')).toBeInTheDocument()
    expect(field).toHaveValue('')
  })

  it('puts the text back and says why when the answer could not be sent', async () => {
    actions.sendPortalReply.mockResolvedValue({ success: false, error: 'Demo mode' })
    const user = userEvent.setup()
    open()
    const field = await screen.findByLabelText('Write to Kari Nordmann in the portal')
    await user.type(field, 'Hello{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Demo mode'))
    expect(field).toHaveValue('Hello')
  })

  it('shows a new message from the customer at once, while the conversation is open', async () => {
    open()
    await screen.findByText('The brake light came on this morning.')
    expect(realtime.following).toBe('customer:kari')

    actions.getPortalConversation.mockResolvedValue(
      thread({
        messages: [
          inbound,
          { ...inbound, id: 'pm3', body: 'It is flashing now.', attachments: [] },
        ],
      })
    )
    // The open conversation keeps its own notification quiet, so this is
    // what brings the message: the customer's thread changed.
    act(() => realtime.handler?.({ hint: 'portal' }))
    expect(await screen.findByText('It is flashing now.')).toBeInTheDocument()
  })

  it('marks as read the messages it shows, by id, and tells the inbox its counts changed', async () => {
    const onRead = vi.fn()
    actions.getPortalConversation.mockResolvedValue(
      thread({
        messages: [
          { ...inbound, id: 'read-before', readAt: '2026-11-14T08:06:00Z' },
          { ...inbound, id: 'ours', direction: 'outbound', authorName: 'Jonas Berg' },
          inbound,
        ],
      })
    )
    render(<PortalConversation customerId="kari" customerName="Kari Nordmann" onRead={onRead} />)
    await waitFor(() => expect(actions.markPortalMessagesSeen).toHaveBeenCalledTimes(1))
    // Never "the whole thread": one that arrives after this read is not named.
    expect(actions.markPortalMessagesSeen).toHaveBeenCalledWith({
      customerId: 'kari',
      ids: ['pm1'],
    })
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1))

    // A new message shows, and is then the one marked.
    actions.getPortalConversation.mockResolvedValue(
      thread({
        messages: [
          { ...inbound, readAt: '2026-11-14T08:07:00Z' },
          { ...inbound, id: 'pm3', body: 'It is flashing now.', attachments: [] },
        ],
      })
    )
    act(() => realtime.handler?.({ hint: 'portal' }))
    await waitFor(() =>
      expect(actions.markPortalMessagesSeen).toHaveBeenLastCalledWith({
        customerId: 'kari',
        ids: ['pm3'],
      })
    )
  })

  it('leaves a message unread that the desk put back as unread, until the thread is read again', async () => {
    const { rerender } = render(
      <PortalConversation customerId="kari" customerName="Kari Nordmann" readSignal={1} />
    )
    await waitFor(() => expect(actions.markPortalMessagesSeen).toHaveBeenCalledTimes(1))

    // "Mark as unread": the same message comes back unread on the re-read.
    act(() => realtime.handler?.({ hint: 'portal' }))
    await waitFor(() => expect(actions.getPortalConversation).toHaveBeenCalledTimes(2))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(actions.markPortalMessagesSeen).toHaveBeenCalledTimes(1)

    // Selecting the thread again reads it again.
    rerender(<PortalConversation customerId="kari" customerName="Kari Nordmann" readSignal={2} />)
    await waitFor(() => expect(actions.markPortalMessagesSeen).toHaveBeenCalledTimes(2))
  })

  it('shows that the customer has seen the answer when they open it', async () => {
    const answer = {
      id: 'pm2',
      direction: 'outbound',
      body: 'Bring it in today.',
      attachments: [],
      authorName: 'Jonas Berg',
      createdAt: '2026-11-14T08:10:00Z',
      readAt: null,
    }
    actions.getPortalConversation.mockResolvedValue(thread({ messages: [inbound, answer] }))
    open()
    await screen.findByText('Bring it in today.')
    expect(screen.queryByText('Seen')).not.toBeInTheDocument()

    actions.getPortalConversation.mockResolvedValue(
      thread({ messages: [inbound, { ...answer, readAt: '2026-11-14T08:12:00Z' }] })
    )
    act(() => realtime.handler?.({ hint: 'portal' }))
    expect(await screen.findByText('Seen')).toBeInTheDocument()
  })

  it('re-reads after the socket reconnects, and ignores other changes to the customer', async () => {
    open()
    await screen.findByText('The brake light came on this morning.')
    const reads = actions.getPortalConversation.mock.calls.length
    // The desk edited the customer's phone number: not the thread.
    act(() => realtime.handler?.({}))
    expect(actions.getPortalConversation.mock.calls.length).toBe(reads)
    act(() => realtime.handler?.(null))
    await waitFor(() => expect(actions.getPortalConversation.mock.calls.length).toBe(reads + 1))
  })

  it('can be read but not answered once the portal chat is turned off', async () => {
    actions.getPortalConversation.mockResolvedValue(thread({ canReply: false }))
    open()
    expect(await screen.findByText('The brake light came on this morning.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Write to Kari Nordmann in the portal')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Customer portal settings' })).toHaveAttribute(
      'href',
      '/settings/customer-portal'
    )
  })

  it('offers to try again when the thread cannot be loaded', async () => {
    actions.getPortalConversation.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The brake light came on this morning.')).toBeInTheDocument()
  })
})
