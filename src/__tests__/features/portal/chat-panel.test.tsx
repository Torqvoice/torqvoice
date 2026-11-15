/**
 * The chat a customer has with the workshop, as they use it: the thread
 * under a line per day on the workshop's clock, photos that open large,
 * what happened to the car drawn in between, a message that shows the moment
 * it is sent and says so when it did not get there, and a composer that
 * sends on Enter. The server is three actions, played here by a small
 * stand-in that keeps a thread the way the real one does.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortalChatEvent, PortalChatMessage } from '@/features/portal/Lib/chatTypes'

const server = vi.hoisted(() => ({
  messages: [] as unknown[],
  events: [] as unknown[],
  enabled: true,
  /** Set to make the next sends fail the way the action answers a refusal. */
  refuse: null as string | null,
  /** Set to make the poll fail. */
  pollFails: false,
  sent: [] as unknown[],
  marked: 0,
}))

vi.mock('@/features/portal/Actions/getPortalThread', () => ({
  getPortalThread: vi.fn(async () => {
    if (server.pollFails) throw new Error('offline')
    return {
      success: true,
      data: {
        enabled: server.enabled,
        unread: 0,
        messages: server.messages,
        events: server.events,
        hasEarlier: false,
      },
    }
  }),
}))
vi.mock('@/features/portal/Actions/sendPortalMessage', () => ({
  sendPortalMessage: vi.fn(async (input: { body: string; attachments: string[] }) => {
    server.sent.push(input)
    if (server.refuse) return { success: false, error: server.refuse }
    const message = {
      id: `sent-${server.sent.length}`,
      direction: 'inbound',
      body: input.body,
      attachments: input.attachments.map((url) => ({
        url: url.replace('/api/protected/files/org1/portal-uploads/', '/portal/org1/files/'),
        kind: 'image',
      })),
      authorName: null,
      createdAt: new Date().toISOString(),
      readAt: null,
    }
    server.messages = [...server.messages, message]
    return { success: true, data: message }
  }),
}))
vi.mock('@/features/portal/Actions/markPortalThreadRead', () => ({
  markPortalThreadRead: vi.fn(async () => {
    server.marked += 1
    return { success: true, data: { marked: 1 } }
  }),
}))
vi.mock('@/features/portal/Actions/getPortalUnread', () => ({
  getPortalUnread: vi.fn(async () => ({ success: true, data: { unread: 0 } })),
}))

import { PortalChatPanel } from '@/features/portal/Components/Chat/PortalChatPanel'

const message = (over: Partial<PortalChatMessage>): PortalChatMessage => ({
  id: 'm1',
  direction: 'outbound',
  body: 'Morning Kari. The V60 is on the lift.',
  attachments: [],
  authorName: 'Jonas',
  // 09:05 in Oslo.
  createdAt: '2026-11-14T08:05:00Z',
  readAt: '2026-11-14T08:06:00Z',
  ...over,
})

const event = (over: Partial<PortalChatEvent>): PortalChatEvent => ({
  id: 'quote:q1',
  kind: 'quote',
  at: '2026-11-14T08:30:00Z',
  vehicle: 'Volvo V60',
  title: 'Front brake pads and discs',
  amount: 'kr 6,480.00',
  href: '/portal/fjordside/quotes/q1',
  answerable: true,
  overdue: false,
  ...over,
})

function panel(
  messages: PortalChatMessage[] = [],
  options: { callHref?: string | null; enabled?: boolean; events?: PortalChatEvent[] } = {}
) {
  server.messages = messages
  server.events = options.events ?? []
  server.enabled = options.enabled ?? true
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <PortalChatPanel
        orgParam="fjordside"
        workshopName="Fjordside Auto"
        callHref={options.callHref === undefined ? 'tel:55000000' : options.callHref}
        enabled={options.enabled ?? true}
        initialMessages={messages}
        initialEvents={options.events}
        clock={{ timeZone: 'Europe/Oslo', timeFormat: '24h' }}
      />
    </QueryClientProvider>
  )
}

const thread = () => within(screen.getByRole('log', { name: 'Messages with Fjordside Auto' }))
const field = () => screen.getByLabelText('Write a message to Fjordside Auto')

beforeEach(() => {
  server.refuse = null
  server.pollFails = false
  server.sent = []
  server.marked = 0
  // Half past one in the afternoon of 14 November in Oslo.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T12:30:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the chat block', () => {
  it('says what it is and offers to call the workshop', () => {
    panel()
    expect(screen.getByRole('heading', { name: 'Messages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call Fjordside Auto' })).toHaveAttribute(
      'href',
      'tel:55000000'
    )
  })

  it('has no call button for a workshop without a phone number', () => {
    panel([], { callHref: null })
    expect(screen.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument()
  })

  it('invites a first message, and a suggestion fills the field', async () => {
    const user = userEvent.setup()
    panel()
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Can you call me?' }))
    expect(field()).toHaveValue('Can you call me?')
    expect(field()).toHaveFocus()
  })
})

describe('reading the thread', () => {
  it('shows it oldest first under the day, with who wrote and when on the workshop clock', () => {
    panel([
      message({
        id: 'old',
        body: 'Your car is booked for Friday.',
        createdAt: '2026-11-12T13:00:00Z',
      }),
      message({}),
      message({
        id: 'm2',
        direction: 'inbound',
        body: 'Can I pick up after 16?',
        authorName: null,
        createdAt: '2026-11-14T09:30:00Z',
        readAt: null,
      }),
    ])
    const first = thread().getByText('Morning Kari. The V60 is on the lift.')
    const second = thread().getByText('Can I pick up after 16?')
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(thread().getByText('Thursday, November 12')).toBeInTheDocument()
    expect(thread().getByText('Today')).toBeInTheDocument()
    expect(thread().getByText('Jonas · 09:05')).toBeInTheDocument()
    expect(thread().getByText('You · 10:30')).toBeInTheDocument()
  })

  it('files a message sent late in the evening under the workshop day, not the UTC one', () => {
    // 00:30 on the 14th in Oslo is still the 13th in UTC.
    panel([message({ createdAt: '2026-11-13T23:30:00Z' })])
    expect(thread().getByText('Today')).toBeInTheDocument()
    expect(thread().getByText('Jonas · 00:30')).toBeInTheDocument()
  })

  it('names the workshop when the author is not known', () => {
    panel([message({ authorName: null })])
    expect(thread().getByText('Fjordside Auto · 09:05')).toBeInTheDocument()
  })

  it('says when the workshop has seen the last message', () => {
    panel([
      message({
        id: 'mine',
        direction: 'inbound',
        authorName: null,
        body: 'Thanks!',
        readAt: '2026-11-14T08:10:00Z',
      }),
    ])
    expect(thread().getByText('You · 09:05 · Seen')).toBeInTheDocument()
  })

  it('shows a photo as a thumbnail that opens large', async () => {
    const user = userEvent.setup()
    panel([message({ attachments: [{ url: '/portal/org1/files/a.jpg', kind: 'image' }] })])
    expect(screen.getByRole('img', { name: 'Photo from Jonas' })).toHaveAttribute(
      'src',
      '/portal/org1/files/a.jpg'
    )
    await user.click(screen.getByRole('button', { name: 'Photo from Jonas, open large' }))
    expect(screen.getAllByAltText('Photo from Jonas')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Close', hidden: true }))
    expect(screen.getAllByAltText('Photo from Jonas')).toHaveLength(1)
  })

  const invoices = (count: number, at = '2026-11-14T11:00:00Z') =>
    Array.from({ length: count }, (_, index) =>
      event({
        id: `invoice:i${index + 1}`,
        kind: 'invoice',
        at,
        title: `INV-${2041 + index}`,
        amount: 'kr 2,732.63',
        href: `/portal/fjordside/invoices/i${index + 1}`,
        answerable: false,
      })
    )

  it('gives a card with a button only to what waits for the customer', () => {
    panel([message({})], {
      events: [
        event({}),
        event({
          id: 'update:u1',
          kind: 'update',
          at: '2026-11-14T10:00:00Z',
          title: 'Pads were down to 2 mm, see the photos.',
          amount: null,
          href: '/share/status-report/fjordside/tok',
          answerable: false,
        }),
        ...invoices(1).map((one) => ({ ...one, overdue: true })),
      ],
    })
    const quote = within(thread().getByRole('article', { name: 'Quote waiting for your answer' }))
    expect(quote.getByText('Front brake pads and discs')).toBeInTheDocument()
    expect(quote.getByText('Volvo V60 · kr 6,480.00')).toBeInTheDocument()
    expect(quote.getByRole('link', { name: 'Read and answer' })).toHaveAttribute(
      'href',
      '/portal/fjordside/quotes/q1'
    )

    const update = within(thread().getByRole('article', { name: 'Update from Fjordside Auto' }))
    expect(update.getByText('Pads were down to 2 mm, see the photos.')).toBeInTheDocument()
    expect(update.getByRole('link', { name: 'See the update' })).toHaveAttribute(
      'href',
      '/share/status-report/fjordside/tok'
    )

    const overdue = within(thread().getByRole('article', { name: 'Invoice overdue' }))
    expect(overdue.getByRole('link', { name: 'See invoice' })).toHaveAttribute(
      'href',
      '/portal/fjordside/invoices/i1'
    )
  })

  it('draws everything else as one quiet line, the whole line a link', () => {
    panel([message({})], {
      events: [
        event({
          id: 'work_started:j1',
          kind: 'work_started',
          at: '2026-11-14T07:40:00Z',
          title: null,
          amount: null,
          href: null,
          answerable: false,
        }),
        // Answered: no longer waiting, so no longer a card.
        event({ answerable: false }),
        ...invoices(1),
      ],
    })
    expect(thread().queryByRole('article')).not.toBeInTheDocument()
    expect(thread().queryByRole('link', { name: 'Read and answer' })).not.toBeInTheDocument()
    expect(
      thread().getByRole('link', { name: /Quote Front brake pads and discs · kr 6,480.00/ })
    ).toHaveAttribute('href', '/portal/fjordside/quotes/q1')
    const invoice = thread().getByRole('link', { name: /Invoice INV-2041 · kr 2,732.63/ })
    expect(invoice).toHaveAttribute('href', '/portal/fjordside/invoices/i1')
    expect(within(invoice).getByText('12:00')).toBeInTheDocument()

    // The work began before the workshop's first message of the day.
    const started = thread().getByText('Work started on your Volvo V60')
    const hello = thread().getByText('Morning Kari. The V60 is on the lift.')
    expect(started.compareDocumentPosition(hello) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('folds a batch of invoices from one day into a single line that opens', async () => {
    const user = userEvent.setup()
    panel([message({})], { events: invoices(13) })
    // One line, not thirteen cards.
    const group = thread().getByText('13 invoices')
    expect(thread().queryByRole('article')).not.toBeInTheDocument()
    expect(thread().getByText('Invoice INV-2041 · kr 2,732.63')).not.toBeVisible()

    await user.click(group)
    expect(thread().getByText('Invoice INV-2041 · kr 2,732.63')).toBeVisible()
    expect(thread().getAllByRole('link', { name: /Invoice INV-/ })).toHaveLength(13)
  })

  it('keeps invoices from different days apart', () => {
    panel([], {
      events: [
        ...invoices(1, '2026-11-12T11:00:00Z'),
        ...invoices(1).map((one) => ({ ...one, id: 'invoice:other' })),
      ],
    })
    expect(thread().queryByText(/2 invoices/)).not.toBeInTheDocument()
    expect(thread().getAllByRole('link', { name: /Invoice INV-2041/ })).toHaveLength(2)
  })

  it('tells the workshop its messages were seen once they are on screen', async () => {
    panel([message({ readAt: null })])
    await waitFor(() => expect(server.marked).toBe(1))
  })

  it('keeps the thread when asking for news fails', async () => {
    server.pollFails = true
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    panel([message({})])
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(thread().getByText('Morning Kari. The V60 is on the lift.')).toBeInTheDocument()
    expect(field()).toBeEnabled()
  })

  it('picks up what the workshop wrote meanwhile', async () => {
    panel([message({})])
    server.messages = [
      ...server.messages,
      message({ id: 'new', body: 'Ready at 15:00.', createdAt: '2026-11-14T12:29:00Z' }),
    ]
    // Coming back to the tab asks again at once; otherwise the poll does.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      window.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await thread().findByText('Ready at 15:00.')).toBeInTheDocument()
  })
})

describe('writing', () => {
  it('has a labelled field, a send button and a photo button', () => {
    panel()
    expect(field()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument()
  })

  it('gives the send button the workshop colour once there is something to send', async () => {
    const user = userEvent.setup()
    panel()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).not.toHaveClass('p-iconbtn--accent')
    await user.type(field(), 'Hello')
    expect(send).toBeEnabled()
    expect(send).toHaveClass('p-iconbtn--accent')
  })

  it('sends on Enter, shows the message at once and clears the field', async () => {
    const user = userEvent.setup()
    panel([message({})])
    await user.type(field(), 'Can I pick up after 16?{Enter}')

    expect(server.sent).toEqual([{ body: 'Can I pick up after 16?', attachments: [] }])
    expect(await thread().findByText('Can I pick up after 16?')).toBeInTheDocument()
    expect(field()).toHaveValue('')
    await waitFor(() => expect(thread().getByText('You · 13:30')).toBeInTheDocument())
    expect(thread().queryByText('Sending')).not.toBeInTheDocument()
  })

  it('starts a new line on Shift and Enter', async () => {
    const user = userEvent.setup()
    panel()
    await user.type(field(), 'One{Shift>}{Enter}{/Shift}Two')
    expect(field()).toHaveValue('One\nTwo')
    expect(server.sent).toEqual([])
  })

  it('does not send an empty message', async () => {
    const user = userEvent.setup()
    panel()
    await user.type(field(), '   {Enter}')
    expect(server.sent).toEqual([])
  })

  it('marks a message that did not get there and sends it again on request', async () => {
    const user = userEvent.setup()
    panel()
    server.refuse = 'network'
    await user.type(field(), 'Is it ready?{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Not sent. Check your connection.')
    expect(thread().getByText('Is it ready?')).toBeInTheDocument()

    server.refuse = null
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(server.sent).toHaveLength(2)
    expect(thread().getByText('Is it ready?')).toBeInTheDocument()
  })

  it('lets a failed message be deleted', async () => {
    const user = userEvent.setup()
    panel()
    server.refuse = 'network'
    await user.type(field(), 'Never mind{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(thread().queryByText('Never mind')).not.toBeInTheDocument()
  })

  it('says so when the workshop turned messages off while the chat was open', async () => {
    const user = userEvent.setup()
    panel()
    server.refuse = 'chat_off'
    await user.type(field(), 'Hello?{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not sent. The workshop has turned messages off.'
    )
    // Nothing more can be written.
    expect(screen.queryByLabelText('Write a message to Fjordside Auto')).not.toBeInTheDocument()
  })

  it('sends a photo with the message through the portal upload route', async () => {
    const stored =
      '/api/protected/files/org1/portal-uploads/11111111-1111-4111-8111-111111111111.jpg'
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ url: stored }), { status: 201 })
    )
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup()
    const { container } = panel()

    const picker = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(picker, new File(['x'], 'brake.jpg', { type: 'image/jpeg' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/portal/fjordside/upload',
      expect.objectContaining({ method: 'POST' })
    )
    expect(await screen.findByRole('img', { name: 'brake.jpg' })).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(server.sent).toEqual([{ body: '', attachments: [stored] }])
    expect(await screen.findByRole('img', { name: 'Photo from You' })).toBeInTheDocument()
  })

  it('refuses a file that is not a photo or a video, and says why', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup({ applyAccept: false })
    const { container } = panel()
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(picker, new File(['x'], 'notes.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only photos and videos can be sent here.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers reading but not writing once the chat is turned off', () => {
    panel([message({})], { enabled: false })
    expect(thread().getByText('Morning Kari. The V60 is on the lift.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Write a message to Fjordside Auto')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'This workshop has turned messages off. You can still read what was written.'
      )
    ).toBeInTheDocument()
  })
})
