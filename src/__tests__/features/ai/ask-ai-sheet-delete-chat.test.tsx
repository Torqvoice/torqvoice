/**
 * Deleting an earlier chat under "Previous chats" in Ask AI. The list used to
 * drop the chat whatever the server answered, so a refused delete looked done
 * and the chat came back on the next opening; a dropped connection threw
 * past the handler with nothing said on the sheet.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listAskAiChats = vi.fn()
const deleteAskAiChat = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/ai/Actions/aiChatActions', () => ({
  listAskAiChats: (subject: unknown) => listAskAiChats(subject),
  loadAskAiChat: vi.fn(),
  deleteAskAiChat: (id: string) => deleteAskAiChat(id),
}))

import { AskAiSheet } from '@/features/ai/Components/AskAiSheet'

const CHATS = [
  { id: 'chat1', title: 'Brake noise history', updatedAt: new Date('2026-11-10T09:00:00Z') },
]

/** Opens the sheet and its list of earlier chats. */
async function openPreviousChats() {
  render(<AskAiSheet subject={{ type: 'vehicle', id: 'v1' }} title="2019 Volvo V70" />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }))
  await waitFor(() => expect(listAskAiChats).toHaveBeenCalled())
  fireEvent.keyDown(screen.getByRole('button', { name: 'Previous chats' }), { key: 'Enter' })
  return screen.findByRole('menu')
}

async function pressDelete(menu: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(menu).getByRole('button', { name: 'Delete chat' }))
  })
}

describe('deleting an earlier Ask AI chat', () => {
  beforeEach(() => {
    listAskAiChats.mockReset()
    listAskAiChats.mockResolvedValue({ success: true, data: CHATS })
    deleteAskAiChat.mockReset()
    vi.mocked(toast.error).mockClear()
  })

  it('takes the chat off the list once the server has deleted it', async () => {
    deleteAskAiChat.mockResolvedValue({ success: true, data: true })
    const menu = await openPreviousChats()
    await within(menu).findByText('Brake noise history')

    await pressDelete(menu)

    expect(deleteAskAiChat).toHaveBeenCalledWith('chat1')
    expect(within(menu).queryByText('Brake noise history')).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('keeps the chat listed and says why when the server refuses', async () => {
    deleteAskAiChat.mockResolvedValue({ success: false, error: 'Insufficient permissions' })
    const menu = await openPreviousChats()
    await within(menu).findByText('Brake noise history')

    await pressDelete(menu)

    expect(toast.error).toHaveBeenCalledWith('Insufficient permissions')
    expect(within(menu).getByText('Brake noise history')).toBeInTheDocument()
  })

  it('keeps the chat listed and says the delete failed when the connection drops', async () => {
    deleteAskAiChat.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    const menu = await openPreviousChats()
    await within(menu).findByText('Brake noise history')

    await pressDelete(menu)

    expect(toast.error).toHaveBeenCalledWith("Couldn't delete the chat. Try again.")
    expect(within(menu).getByText('Brake noise history')).toBeInTheDocument()
  })
})
