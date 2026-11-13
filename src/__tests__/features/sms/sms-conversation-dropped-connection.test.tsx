/**
 * An SMS thread on a dropped connection. A server action that cannot reach
 * the server throws instead of answering. The send ran in a transition, so
 * the throw went to the error boundary: the messages page was replaced by
 * the error page and the text, already cleared from the box, was gone. A
 * delete that threw left the dialog's Delete busy until the page was
 * reloaded, and said nothing.
 */
import { Component, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const sendSmsToCustomer = vi.fn()
const getConversation = vi.fn()
const deleteSmsMessage = vi.fn()

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/sms/Actions/smsActions', () => ({
  sendSmsToCustomer: (input: unknown) => sendSmsToCustomer(input),
  getConversation: (...args: unknown[]) => getConversation(...args),
  deleteSmsMessage: (id: string) => deleteSmsMessage(id),
}))
// Reads the workshop's saved texts on its own; not what is under test.
vi.mock('@/features/sms/Components/SmsTemplateMenu', () => ({ SmsTemplateMenu: () => null }))

import { SmsConversation } from '@/features/sms/Components/SmsConversation'

/** Stands in for the app's error page, so losing the page is visible. */
class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Something went wrong</p> : this.props.children
  }
}

const SENT = {
  id: 'm1',
  direction: 'outbound',
  body: 'Your car is booked for Monday',
  status: 'delivered',
  createdAt: '2026-11-10T09:00:00.000Z',
  fromNumber: '+4790000001',
  toNumber: '+4790000000',
}

function renderThread(initialMessages = [SENT]) {
  render(
    <ErrorPage>
      <SmsConversation
        customerId="c1"
        customerName="Ada Berg"
        customerPhone="+4790000000"
        initialMessages={initialMessages}
        initialNextCursor={null}
      />
    </ErrorPage>
  )
}

const box = () => screen.getByPlaceholderText('Message Ada Berg...')
const sendButton = () => screen.getByRole('button', { name: 'Send message' })

async function typeAndSend(text: string) {
  fireEvent.change(box(), { target: { value: text } })
  await act(async () => {
    fireEvent.click(sendButton())
  })
}

describe('SMS thread on a dropped connection', () => {
  beforeEach(() => {
    sendSmsToCustomer.mockReset()
    getConversation.mockReset()
    deleteSmsMessage.mockReset()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // jsdom has no scrolling; a new message scrolls the thread to the end.
    Element.prototype.scrollTo = vi.fn()
  })

  it('says the message was not sent, keeps the text, and sends it on the next try', async () => {
    sendSmsToCustomer.mockImplementation(offline)
    renderThread()

    await typeAndSend('Your car is ready')

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to send SMS'))
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(box()).toHaveValue('Your car is ready')
    expect(sendButton()).toBeEnabled()

    // The connection is back.
    sendSmsToCustomer.mockResolvedValue({ success: true })
    getConversation.mockResolvedValue({
      success: true,
      data: {
        messages: [SENT, { ...SENT, id: 'm2', body: 'Your car is ready' }],
        nextCursor: null,
      },
    })
    await act(async () => {
      fireEvent.click(sendButton())
    })

    expect(sendSmsToCustomer).toHaveBeenCalledTimes(2)
    expect(sendSmsToCustomer).toHaveBeenLastCalledWith({
      customerId: 'c1',
      body: 'Your car is ready',
    })
    await waitFor(() => expect(box()).toHaveValue(''))
    expect(screen.getByText('Your car is ready')).toBeInTheDocument()
  })

  it('keeps the page when the message went but the thread cannot be read back', async () => {
    sendSmsToCustomer.mockResolvedValue({ success: true })
    getConversation.mockImplementation(offline)
    renderThread()

    await typeAndSend('Your car is ready')

    await waitFor(() => expect(getConversation).toHaveBeenCalled())
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(box()).toHaveValue('')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('says the delete failed and leaves the message there to delete again', async () => {
    deleteSmsMessage.mockImplementation(offline)
    renderThread()

    fireEvent.click(screen.getByTitle('Delete message'))
    const question = await screen.findByRole('alertdialog')
    await act(async () => {
      fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
    })

    expect(deleteSmsMessage).toHaveBeenCalledWith('m1')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete message'))
    expect(screen.getByText('Your car is booked for Monday')).toBeInTheDocument()

    // Not left busy: asking again offers a Delete that can be pressed.
    fireEvent.click(screen.getByTitle('Delete message'))
    const again = await screen.findByRole('alertdialog')
    expect(within(again).getByRole('button', { name: 'Delete' })).toBeEnabled()
  })
})
