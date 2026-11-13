/**
 * Picking another customer in the Telegram inbox. The previous customer's
 * thread stayed on screen when the new one could not be loaded, under the
 * new customer's selection, with a composer that sends to the new customer.
 * An answer for an earlier pick that arrives late is dropped as well.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getTelegramConversation = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/telegram/Actions/telegramActions', () => ({
  getTelegramConversation: async (id: string) => getTelegramConversation(id),
  deleteTelegramConversation: vi.fn(),
}))
vi.mock('@/features/telegram/Actions/telegramThreadActions', () => ({
  getRecentTelegramThreads: vi.fn(),
}))
// The thread list and the composer have their own tests; here they only show
// which customer is picked and whose thread is open.
vi.mock('@/features/telegram/Components/TelegramThreadList', () => ({
  TelegramThreadList: ({
    threads,
    onSelectThread,
  }: {
    threads: { customerId: string; customerName: string }[]
    onSelectThread: (id: string) => void
  }) => (
    <div>
      {threads.map((th) => (
        <button key={th.customerId} type="button" onClick={() => onSelectThread(th.customerId)}>
          {th.customerName}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/features/telegram/Components/TelegramConversation', () => ({
  TelegramConversation: ({
    customerId,
    customerName,
  }: {
    customerId: string
    customerName: string
  }) => <p>{`Thread of ${customerName}, replies go to ${customerId}`}</p>,
}))

import { TelegramMessagesClient } from '@/features/telegram/Components/TelegramMessagesClient'

const thread = (customerId: string, customerName: string) => ({
  customerId,
  customerName,
  telegramChatId: `chat-${customerId}`,
  lastMessage: { id: `m-${customerId}`, body: 'Hi', direction: 'in', createdAt: new Date() },
})

const THREADS = [thread('a', 'Ada'), thread('b', 'Ben')]
const ANSWER = { success: true, data: { messages: [], nextCursor: null } }

async function pick(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('switching customers in the Telegram inbox', () => {
  beforeEach(() => {
    getTelegramConversation.mockReset()
  })

  it("does not leave the previous customer's thread open when the next one cannot be loaded", async () => {
    getTelegramConversation.mockImplementation(async (id: string) =>
      id === 'a' ? ANSWER : { success: false, error: 'Forbidden' }
    )
    render(<TelegramMessagesClient initialThreads={THREADS} />)

    await pick('Ada')
    expect(screen.getByText('Thread of Ada, replies go to a')).toBeInTheDocument()

    await pick('Ben')
    expect(screen.queryByText(/Thread of Ada/)).not.toBeInTheDocument()
    expect(screen.queryByText(/replies go to b/)).not.toBeInTheDocument()
  })

  it('drops the answer for an earlier pick that arrives after the next one', async () => {
    let answerAda!: (value: unknown) => void
    getTelegramConversation.mockImplementation((id: string) =>
      id === 'a'
        ? new Promise((resolve) => {
            answerAda = resolve
          })
        : Promise.resolve(ANSWER)
    )
    render(<TelegramMessagesClient initialThreads={THREADS} />)

    await pick('Ada')
    await pick('Ben')
    expect(screen.getByText('Thread of Ben, replies go to b')).toBeInTheDocument()

    await act(async () => {
      answerAda(ANSWER)
    })
    expect(screen.getByText('Thread of Ben, replies go to b')).toBeInTheDocument()
    expect(screen.queryByText(/Thread of Ada/)).not.toBeInTheDocument()
  })
})
