/**
 * A WhatsApp thread on a dropped connection. Sending awaits two things in one
 * transition, the send and then reading the thread back, and either can throw
 * when the server cannot be reached. A throw from either went to the error
 * boundary and the whole messages page was replaced by the error page.
 */
import { Component, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const getWhatsappConversation = vi.fn()
const getWhatsappWindowState = vi.fn()
const sendWhatsappToCustomer = vi.fn()
const router = { refresh: vi.fn(), push: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/features/whatsapp/Actions/whatsappActions', () => ({
  getWhatsappConversation: (id: string) => getWhatsappConversation(id),
  getWhatsappConversationByPhone: vi.fn(),
  getWhatsappWindowState: (id: string) => getWhatsappWindowState(id),
  sendWhatsappToCustomer: (input: unknown) => sendWhatsappToCustomer(input),
  deleteWhatsappMessage: vi.fn(),
}))

import { WhatsappConversation } from '@/features/whatsapp/Components/WhatsappConversation'

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

const THREAD = { key: 'c1', customerId: 'c1', name: 'Ada Berg', phone: '+4790000000' }
const OPEN_WINDOW = {
  success: true,
  data: { open: true, hasTemplate: true, hasMediaTemplate: true },
}

async function renderThread(onSent = vi.fn()) {
  render(
    <ErrorPage>
      <WhatsappConversation thread={THREAD} onSent={onSent} />
    </ErrorPage>
  )
  await screen.findByText('Nothing here yet.')
  return onSent
}

async function typeAndSend(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Write a message'), { target: { value: text } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  })
}

describe('WhatsApp thread on a dropped connection', () => {
  beforeEach(() => {
    getWhatsappConversation.mockReset()
    getWhatsappWindowState.mockReset()
    sendWhatsappToCustomer.mockReset()
    vi.mocked(toast.error).mockClear()
    router.refresh.mockClear()
    getWhatsappConversation.mockResolvedValue({ success: true, data: [] })
    getWhatsappWindowState.mockResolvedValue(OPEN_WINDOW)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // jsdom has no scrolling; a sent message scrolls the thread to the end.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('says the message was not sent and keeps what was typed', async () => {
    sendWhatsappToCustomer.mockImplementation(offline)
    const onSent = await renderThread()

    await typeAndSend('Your car is ready')

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not send the message'))
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a message')).toHaveValue('Your car is ready')
    expect(onSent).not.toHaveBeenCalled()
  })

  it('keeps the page when the message went but the thread cannot be read back', async () => {
    sendWhatsappToCustomer.mockResolvedValue({ success: true, data: { usedTemplate: false } })
    const onSent = await renderThread()
    getWhatsappConversation.mockImplementation(offline)

    await typeAndSend('Your car is ready')

    await waitFor(() => expect(onSent).toHaveBeenCalled())
    expect(getWhatsappConversation).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a message')).toHaveValue('')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('stops loading when the thread cannot be read at all', async () => {
    getWhatsappConversation.mockImplementation(offline)
    getWhatsappWindowState.mockImplementation(offline)

    await renderThread()

    expect(screen.getByPlaceholderText('Write a message')).toBeInTheDocument()
  })
})
