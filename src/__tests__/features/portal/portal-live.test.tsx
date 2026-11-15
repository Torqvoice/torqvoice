/**
 * The chat is live: what the workshop writes is on the customer's screen as
 * it is sent, the unread badge follows, and none of it depends on the poll.
 * The socket here is a pretend one the test speaks through; the server is
 * the same small stand-in the chat's own test uses.
 *
 * And the other half: where the socket cannot be opened, or drops, the page
 * carries on exactly as before and shows no error.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalChatMessage } from '@/features/portal/Lib/chatTypes'

const server = vi.hoisted(() => ({
  messages: [] as unknown[],
  enabled: true,
  unread: 0,
  threadReads: 0,
  marked: 0,
}))

vi.mock('@/features/portal/Actions/getPortalThread', () => ({
  getPortalThread: vi.fn(async () => {
    server.threadReads += 1
    return {
      success: true,
      data: {
        enabled: server.enabled,
        unread: server.unread,
        messages: server.messages,
        events: [],
        hasEarlier: false,
      },
    }
  }),
}))
vi.mock('@/features/portal/Actions/sendPortalMessage', () => ({ sendPortalMessage: vi.fn() }))
vi.mock('@/features/portal/Actions/markPortalThreadRead', () => ({
  markPortalThreadRead: vi.fn(async () => {
    server.marked += 1
    server.unread = 0
    return { success: true, data: { marked: 1 } }
  }),
}))
vi.mock('@/features/portal/Actions/getPortalUnread', () => ({
  getPortalUnread: vi.fn(async () => ({ success: true, data: { unread: server.unread } })),
}))

import { PortalChatPanel } from '@/features/portal/Components/Chat/PortalChatPanel'
import {
  type PortalSocketLike,
  resetPortalLines,
  setPortalSocketFactory,
} from '@/features/portal/Components/Chat/portalLive'
import { usePortalUnread } from '@/features/portal/Components/Chat/usePortalUnread'

/** The browser's socket, with the server's side in the test's hands. */
class FakeSocket implements PortalSocketLike {
  readyState = 0
  sent: string[] = []
  closed = false
  onopen: PortalSocketLike['onopen'] = null
  onmessage: PortalSocketLike['onmessage'] = null
  onclose: PortalSocketLike['onclose'] = null
  onerror: PortalSocketLike['onerror'] = null
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
    this.readyState = 3
  }
  /** The server accepted the customer's session. */
  accept() {
    this.readyState = 1
    this.onopen?.({})
    this.say({ t: 'ready' })
  }
  say(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  /** The link drops, or the server refuses. */
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

let sockets: FakeSocket[] = []
const latest = () => sockets[sockets.length - 1]

const message = (over: Partial<PortalChatMessage>): PortalChatMessage => ({
  id: 'm1',
  direction: 'outbound',
  body: 'Morning Kari. The V60 is on the lift.',
  attachments: [],
  authorName: 'Jonas',
  createdAt: '2026-11-14T08:05:00Z',
  readAt: '2026-11-14T08:06:00Z',
  ...over,
})

const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

function chat(messages: PortalChatMessage[] = [message({})]) {
  server.messages = messages
  const client = new QueryClient()
  render(
    <PortalChatPanel
      orgParam="fjordside"
      workshopName="Fjordside Auto"
      callHref={null}
      enabled
      initialMessages={messages}
      clock={{ timeZone: 'Europe/Oslo', timeFormat: '24h' }}
    />,
    { wrapper: wrap(client) }
  )
  return client
}

const thread = () => within(screen.getByRole('log', { name: 'Messages with Fjordside Auto' }))
/** Lets the chat's first read, on appearing, finish. */
const settled = async () => {
  await waitFor(() => expect(server.threadReads).toBeGreaterThan(0))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

beforeEach(() => {
  sockets = []
  server.enabled = true
  server.unread = 0
  server.threadReads = 0
  server.marked = 0
  resetPortalLines()
  setPortalSocketFactory((url) => {
    const socket = new FakeSocket(url)
    sockets.push(socket)
    return socket
  })
})
afterEach(() => {
  setPortalSocketFactory(null)
  vi.useRealTimers()
})

describe('the chat, live', () => {
  it("opens one socket at the portal's own address", async () => {
    chat()
    await settled()
    expect(sockets).toHaveLength(1)
    expect(latest().url).toMatch(/^ws:\/\/[^/]+\/portal\/fjordside\/ws$/)
  })

  it('shows what the workshop wrote the moment it is told, without waiting for the poll', async () => {
    chat()
    await settled()
    act(() => latest().accept())
    await settled()

    server.messages = [
      ...server.messages,
      message({
        id: 'm2',
        body: 'Ready at 15:00.',
        createdAt: '2026-11-14T12:29:00Z',
        readAt: null,
      }),
    ]
    server.unread = 1
    act(() => latest().say({ t: 'thread' }))

    expect(await thread().findByText('Ready at 15:00.')).toBeInTheDocument()
    // On screen, so the workshop is told it was seen.
    await waitFor(() => expect(server.marked).toBe(1))
  })

  it('shows that the workshop has seen the message when it is told', async () => {
    const mine = message({
      id: 'mine',
      direction: 'inbound',
      authorName: null,
      body: 'Can I pick up after 16?',
      readAt: null,
    })
    chat([mine])
    await settled()
    act(() => latest().accept())
    await settled()
    expect(thread().queryByText(/Seen/)).not.toBeInTheDocument()

    server.messages = [{ ...mine, readAt: '2026-11-14T08:10:00Z' }]
    act(() => latest().say({ t: 'thread' }))
    expect(await thread().findByText(/· Seen/)).toBeInTheDocument()
  })

  it('stops the customer writing when the workshop switches the chat off', async () => {
    chat()
    await settled()
    act(() => latest().accept())
    await settled()
    expect(screen.getByLabelText('Write a message to Fjordside Auto')).toBeInTheDocument()

    server.enabled = false
    act(() => latest().say({ t: 'thread' }))
    await waitFor(() =>
      expect(screen.queryByLabelText('Write a message to Fjordside Auto')).not.toBeInTheDocument()
    )
  })

  it('reads the thread again when the socket comes back after a drop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    chat()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    act(() => latest().accept())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })

    // The link drops; the workshop answers while nobody is listening.
    act(() => latest().drop())
    server.messages = [
      ...server.messages,
      message({ id: 'm2', body: 'Ready at 15:00.', createdAt: '2026-11-14T12:29:00Z' }),
    ]
    expect(thread().queryByText('Ready at 15:00.')).not.toBeInTheDocument()

    // It tries again by itself, and being back is a reason to read.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(sockets).toHaveLength(2)
    act(() => latest().accept())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(thread().getByText('Ready at 15:00.')).toBeInTheDocument()
  })

  it('does not come back after the server says the session is gone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    chat()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    act(() => latest().drop(4001))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(sockets).toHaveLength(1)
    // The page itself is untouched.
    expect(thread().getByText('Morning Kari. The V60 is on the lift.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('works as before where no socket can be opened', async () => {
    setPortalSocketFactory(() => {
      throw new Error('blocked')
    })
    chat()
    await settled()
    expect(thread().getByText('Morning Kari. The V60 is on the lift.')).toBeInTheDocument()
    expect(screen.getByLabelText('Write a message to Fjordside Auto')).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes the socket when the last listener leaves the page', async () => {
    server.messages = [message({})]
    const client = new QueryClient()
    const { unmount } = renderHook(() => usePortalUnread('fjordside', 0), { wrapper: wrap(client) })
    expect(sockets).toHaveLength(1)
    unmount()
    expect(latest().closed).toBe(true)
  })
})

describe('the unread badge, live', () => {
  it('counts a new message from the workshop the moment it is told', async () => {
    const client = new QueryClient()
    const { result } = renderHook(() => usePortalUnread('fjordside', 0), { wrapper: wrap(client) })
    expect(result.current).toBe(0)
    act(() => latest().accept())

    server.unread = 2
    act(() => latest().say({ t: 'thread' }))
    await waitFor(() => expect(result.current).toBe(2))
  })

  it('shares one socket with the chat on the same page', async () => {
    const client = chat()
    renderHook(() => usePortalUnread('fjordside', 0), { wrapper: wrap(client) })
    await settled()
    expect(sockets).toHaveLength(1)
  })
})
