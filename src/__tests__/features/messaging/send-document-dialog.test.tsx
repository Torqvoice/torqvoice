/**
 * One dialog sends a quote, an invoice or an inspection: by email, text or
 * WhatsApp, each to the customer's address or number, or to one typed in for
 * a job whose customer has not been entered yet. A channel the workshop has
 * not set up is still shown, disabled, with the way to turn it on.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getShareChannels = vi.fn()
const getWhatsappWindowState = vi.fn()
const sendQuoteLink = vi.fn()
const sendInvoiceLink = vi.fn()
const sendInspectionLink = vi.fn()

// A Radix checkbox inside a form measures itself; jsdom has no ResizeObserver.
class NoResize {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', NoResize)

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/features/messaging/Actions/getShareChannels', () => ({
  getShareChannels: async () => getShareChannels(),
}))
vi.mock('@/features/messaging/Actions/sendDocumentLink', () => ({
  sendQuoteLink: async (input: unknown) => sendQuoteLink(input),
  sendInvoiceLink: async (input: unknown) => sendInvoiceLink(input),
  sendInspectionLink: async (input: unknown) => sendInspectionLink(input),
}))
vi.mock('@/features/whatsapp/Actions/whatsappActions', () => ({
  getWhatsappWindowState: async (id: string) => getWhatsappWindowState(id),
}))
vi.mock('@/features/email/Actions/emailPreferenceActions', () => ({
  getAttachPdfDefault: async () => ({ success: true, data: { attachPdf: false } }),
}))

import {
  SendDocumentDialog,
  type SendDocumentKind,
} from '@/features/messaging/Components/SendDocumentDialog'

const customer = { id: 'c1', name: 'Ola Nordmann', email: 'ola@nordmann.no', phone: '+4790000000' }
type Status = 'ready' | 'not_connected' | 'not_in_plan'

function channels(
  over: Partial<Record<'email' | 'sms' | 'whatsapp', Status>> = {},
  isCloud = true
) {
  getShareChannels.mockResolvedValue({
    success: true,
    data: { email: 'ready', sms: 'ready', whatsapp: 'ready', isCloud, ...over },
  })
}

function whatsappWindow(open: boolean, hasTemplate: boolean) {
  getWhatsappWindowState.mockResolvedValue({
    success: true,
    data: { configured: true, open, hasTemplate, hasMediaTemplate: false, lastInboundAt: null },
  })
}

const sendEmail = vi.fn()
const onOpenChange = vi.fn()
const onSent = vi.fn()

async function show(
  options: { kind?: SendDocumentKind; customer?: typeof customer | null; shareUrl?: string } = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <SendDocumentDialog
          open
          onOpenChange={onOpenChange}
          kind={options.kind ?? 'invoice'}
          documentId="doc1"
          shareUrl={options.shareUrl}
          customer={options.customer === undefined ? customer : options.customer}
          sendEmail={sendEmail}
          onSent={onSent}
        />
      </QueryClientProvider>
    )
  })
  // The rows unlock once the workshop's channels are known.
  await vi.waitFor(() => expect(screen.getByLabelText('Email address')).toBeEnabled())
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name })
const sendButton = () => screen.getByRole('button', { name: 'Send' })
async function send() {
  await act(async () => {
    fireEvent.click(sendButton())
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  channels()
  whatsappWindow(true, false)
  sendEmail.mockResolvedValue({ success: true })
  for (const action of [sendQuoteLink, sendInvoiceLink, sendInspectionLink]) {
    action.mockResolvedValue({ success: true })
  }
})

describe('sending to the customer on file', () => {
  it('starts with the customer’s address and number, email ticked', async () => {
    await show()

    expect(screen.getByRole('dialog', { name: 'Send invoice' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue('ola@nordmann.no')
    expect(screen.getByLabelText('Phone number for SMS')).toHaveValue('+4790000000')
    expect(screen.getByLabelText('Phone number for WhatsApp')).toHaveValue('+4790000000')
    expect(box(/Email/)).toBeChecked()
    expect(box(/SMS/)).not.toBeChecked()
    expect(box(/WhatsApp/)).not.toBeChecked()
  })

  it('emails the document with the message, and closes', async () => {
    await show()
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: 'Ready on Monday' } })
    await send()

    expect(sendEmail).toHaveBeenCalledWith('ola@nordmann.no', 'Ready on Monday', false)
    expect(sendInvoiceLink).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Email sent')
    expect(onSent).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('attaches the PDF as well when asked', async () => {
    await show()
    fireEvent.click(box(/Attach the PDF as well/))
    await send()

    expect(sendEmail).toHaveBeenCalledWith('ola@nordmann.no', undefined, true)
  })

  it('sends by text and WhatsApp together, without an email', async () => {
    await show()
    fireEvent.click(box(/Email/))
    fireEvent.click(box(/SMS/))
    fireEvent.click(box(/WhatsApp/))
    await send()

    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendInvoiceLink).toHaveBeenCalledWith({ id: 'doc1', channel: 'sms', to: '+4790000000' })
    expect(sendInvoiceLink).toHaveBeenCalledWith({
      id: 'doc1',
      channel: 'whatsapp',
      to: '+4790000000',
    })
    expect(toast.success).toHaveBeenCalledWith('SMS sent & WhatsApp sent')
  })

  it.each([
    ['quote', 'Send quote', sendQuoteLink],
    ['inspection', 'Send inspection', sendInspectionLink],
  ] as const)('sends a %s through its own action', async (kind, title, action) => {
    await show({ kind })
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument()
    fireEvent.click(box(/SMS/))
    fireEvent.click(box(/Email/))
    await send()

    expect(action).toHaveBeenCalledWith({ id: 'doc1', channel: 'sms', to: '+4790000000' })
  })

  it('shows the link the document already has', async () => {
    await show({ shareUrl: 'https://app.test/share/invoice/org1/tok' })
    expect(screen.getByText('https://app.test/share/invoice/org1/tok')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })
})

describe('sending when the customer’s details are not on file', () => {
  it('has nothing to send to until an address or a number is typed', async () => {
    await show({ customer: null })

    expect(screen.getByLabelText('Email address')).toHaveValue('')
    expect(box(/Email/)).not.toBeChecked()
    expect(sendButton()).toBeDisabled()
  })

  it('texts the number that was typed', async () => {
    await show({ customer: null })
    fireEvent.change(screen.getByLabelText('Phone number for SMS'), {
      target: { value: '912 345 678' },
    })

    // Typing who it goes to is choosing the channel.
    expect(box(/SMS/)).toBeChecked()
    await send()
    expect(sendInvoiceLink).toHaveBeenCalledWith({ id: 'doc1', channel: 'sms', to: '912 345 678' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('emails an address typed over the customer’s', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'fleet@example.com' },
    })
    await send()

    expect(sendEmail).toHaveBeenCalledWith('fleet@example.com', undefined, false)
  })
})

describe('a channel that cannot send', () => {
  it('shows SMS disabled with the way to connect a provider', async () => {
    channels({ sms: 'not_connected' })
    await show()

    expect(screen.getByText('Connect SMS under Integrations to send this way.')).toBeInTheDocument()
    expect(box(/SMS/)).toBeDisabled()
    expect(screen.getByLabelText('Phone number for SMS')).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open Integrations' })).toHaveAttribute(
      'href',
      '/settings/integrations'
    )
  })

  it('points a cloud workshop without WhatsApp in its plan to the plans', async () => {
    channels({ whatsapp: 'not_in_plan' }, true)
    await show()

    expect(screen.getByText('WhatsApp is not included in your plan.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/settings/subscription'
    )
  })

  it('points a self-hosted workshop to the licence page', async () => {
    channels({ sms: 'not_in_plan' }, false)
    await show()

    expect(screen.getByRole('link', { name: 'Activate License' })).toHaveAttribute(
      'href',
      '/settings/license'
    )
  })

  it('explains WhatsApp’s 24 hour rule for the customer’s number, and lifts it for another', async () => {
    whatsappWindow(false, false)
    await show()

    expect(
      await screen.findByText(
        'This customer has not written to you on WhatsApp in the last 24 hours, and no approved template is set up to reach them.'
      )
    ).toBeInTheDocument()
    expect(box(/WhatsApp/)).toBeDisabled()

    // Another number has no conversation on file to judge by: it is tried.
    fireEvent.change(screen.getByLabelText('Phone number for WhatsApp'), {
      target: { value: '+4791111111' },
    })
    expect(box(/WhatsApp/)).toBeEnabled()
    expect(box(/WhatsApp/)).toBeChecked()
  })

  it('offers WhatsApp outside the 24 hours when a template can carry it', async () => {
    whatsappWindow(false, true)
    await show()

    await vi.waitFor(() => expect(getWhatsappWindowState).toHaveBeenCalledWith('c1'))
    expect(box(/WhatsApp/)).toBeEnabled()
  })
})

describe('a send that fails', () => {
  it('says why and keeps the dialog open with the channel still ticked', async () => {
    sendInvoiceLink.mockResolvedValue({ success: false, error: 'Number not on WhatsApp' })
    await show()
    fireEvent.click(box(/Email/))
    fireEvent.click(box(/WhatsApp/))
    await send()

    expect(toast.error).toHaveBeenCalledWith('Number not on WhatsApp')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(box(/WhatsApp/)).toBeChecked()
  })

  it('still sends the other channels and reports the one that went', async () => {
    sendEmail.mockResolvedValue({ success: false, error: 'Mailbox full' })
    await show()
    fireEvent.click(box(/SMS/))
    await send()

    expect(toast.error).toHaveBeenCalledWith('Mailbox full')
    expect(toast.success).toHaveBeenCalledWith('SMS sent')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('treats a dropped connection as a failure, not a crash', async () => {
    sendEmail.mockRejectedValue(new TypeError('Failed to fetch'))
    await show()
    await send()

    expect(toast.error).toHaveBeenCalledWith('Failed to send email')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
