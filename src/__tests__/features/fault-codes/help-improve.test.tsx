import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "Help us improve" on the fault code pages: a workshop writes or pastes where a make's codes
 * are, what is wrong or an idea, and it is mailed to the Torqvoice team with the person to
 * reply to and the code on screen.
 */

const h = vi.hoisted(() => ({
  send: vi.fn(),
  sendMail: vi.fn(),
  cloud: true,
  findOrg: vi.fn(),
  findUser: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

describe('the Help us improve dialog', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('@/features/fault-codes/Actions/sendFaultCodeFeedback', () => ({
      sendFaultCodeFeedback: h.send,
    }))
    h.send.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  async function open(code: string | null = 'BMW 2A82') {
    const { FaultCodesNotice } = await import('@/features/fault-codes/Components/FaultCodesNotice')
    render(<FaultCodesNotice improve={{ code }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Help us improve' }))
    return within(await screen.findByRole('dialog'))
  }

  it('sends what was written with a topic and the code on screen, then says thanks', async () => {
    h.send.mockResolvedValueOnce({ success: true, data: { sent: true } })
    const dialog = await open()
    expect(dialog.getByText('Help us improve fault codes')).toBeInTheDocument()
    const send = dialog.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    fireEvent.click(dialog.getByRole('button', { name: 'Codes we are missing' }))
    fireEvent.change(dialog.getByLabelText('Your message'), {
      target: {
        value: "Ford's codes: https://www.example.com/ford/dtc and http://parts.example.org/x",
      },
    })
    // The links are picked out, so the sender sees they were understood.
    expect(dialog.getByRole('list', { name: 'Links in your message' })).toHaveTextContent(
      'example.com'
    )
    expect(dialog.getByText('parts.example.org')).toBeInTheDocument()
    expect(dialog.getByText('About BMW 2A82')).toBeInTheDocument()

    fireEvent.click(send)
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Thanks. Your message is on its way to the Torqvoice team.'
      )
    )
    expect(h.send).toHaveBeenCalledWith({
      topic: 'makes',
      message: "Ford's codes: https://www.example.com/ford/dtc and http://parts.example.org/x",
      code: 'BMW 2A82',
      page: '/',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('leaves the code out when asked, and keeps the message when sending fails', async () => {
    h.send.mockResolvedValueOnce({ success: true, data: { sent: false, reason: 'limited' } })
    const dialog = await open()
    fireEvent.click(dialog.getByRole('button', { name: 'Leave out' }))
    expect(dialog.queryByText('About BMW 2A82')).not.toBeInTheDocument()
    fireEvent.change(dialog.getByLabelText('Your message'), { target: { value: 'An idea.' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'You have sent a few messages already. Try again in an hour.'
      )
    )
    expect(h.send.mock.calls[0][0]).toMatchObject({ code: undefined, topic: undefined })
    expect(dialog.getByLabelText('Your message')).toHaveValue('An idea.')
  })

  it('is not offered where the workshop is not connected to Torqvoice', async () => {
    const { FaultCodesNotice } = await import('@/features/fault-codes/Components/FaultCodesNotice')
    render(<FaultCodesNotice improve={null} />)
    expect(screen.queryByRole('button', { name: 'Help us improve' })).not.toBeInTheDocument()
  })
})

describe('sending it', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('@/features/fault-codes/Actions/sendFaultCodeFeedback')
    vi.doMock('@/lib/with-auth', () => ({
      withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => unknown) => {
        try {
          return { success: true, data: await fn({ organizationId: 'org1', userId: 'user1' }) }
        } catch (error) {
          return { success: false, error: (error as Error).message }
        }
      },
    }))
    vi.doMock('@/lib/db', () => ({
      db: { organization: { findUnique: h.findOrg }, user: { findUnique: h.findUser } },
    }))
    vi.doMock('@/lib/email', () => ({
      getFromAddress: async () => 'Torqvoice <noreply@torqvoice.com>',
      sendMail: h.sendMail,
    }))
    vi.doMock('@/lib/support', () => ({ getSupportRecipient: async () => 'post@torqvoice.com' }))
    vi.doMock('@/lib/features', () => ({ isCloudMode: () => h.cloud }))
    vi.doMock('@/lib/demo', () => ({ demoGuard: () => undefined }))
    h.cloud = true
    h.sendMail.mockReset()
    h.findOrg.mockResolvedValue({ name: 'Bergen Auto' })
    h.findUser.mockResolvedValue({ name: 'Kari Nordmann', email: 'kari@bergenauto.no' })
  })

  it('mails the Torqvoice team, with the person to reply to and the code in the subject', async () => {
    const { sendFaultCodeFeedback } = await import(
      '@/features/fault-codes/Actions/sendFaultCodeFeedback'
    )
    const result = await sendFaultCodeFeedback({
      topic: 'source',
      message: 'https://example.com/bulletin',
      code: 'BMW 2A82',
      page: '/fault-codes/oem/bmw/2A82',
    })
    expect(result).toEqual({ success: true, data: { sent: true } })
    const mail = h.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('post@torqvoice.com')
    expect(mail.replyTo).toBe('"Kari Nordmann" <kari@bergenauto.no>')
    expect(mail.subject).toBe('[Improve] Fault codes: A source or link: BMW 2A82')
    expect(mail.html).toContain('https://example.com/bulletin')
    expect(mail.html).toContain('Bergen Auto')
    expect(mail.html).toContain('/fault-codes/oem/bmw/2A82')
  })

  it('takes five an hour from one person, and none from a self-hosted install', async () => {
    const { sendFaultCodeFeedback } = await import(
      '@/features/fault-codes/Actions/sendFaultCodeFeedback'
    )
    for (let i = 0; i < 5; i++) {
      expect(await sendFaultCodeFeedback({ message: `Idea ${i}` })).toMatchObject({
        data: { sent: true },
      })
    }
    expect(await sendFaultCodeFeedback({ message: 'One more' })).toEqual({
      success: true,
      data: { sent: false, reason: 'limited' },
    })
    expect(h.sendMail).toHaveBeenCalledTimes(5)

    h.cloud = false
    const selfHosted = await sendFaultCodeFeedback({ message: 'Hello' })
    expect(selfHosted.success).toBe(false)
  })
})
