/**
 * A quote, an invoice or an inspection can go to the customer on WhatsApp
 * from its share dialog, with the same wording as the text message. The box
 * is always there, and says why when it cannot be used: WhatsApp not
 * connected, not in the plan, or the customer out of reach under WhatsApp's
 * 24 hour rule with no approved template to fall back on.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getShareChannels = vi.fn()
const getWhatsappWindowState = vi.fn()
const sendWhatsappToCustomer = vi.fn()
const sendSmsToCustomer = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/features/messaging/Actions/getShareChannels', () => ({
  getShareChannels: async () => getShareChannels(),
}))
vi.mock('@/features/whatsapp/Actions/whatsappActions', () => ({
  getWhatsappWindowState: async (id: string) => getWhatsappWindowState(id),
  sendWhatsappToCustomer: async (input: unknown) => sendWhatsappToCustomer(input),
}))
vi.mock('@/features/quotes/Actions/quoteShareActions', () => ({
  revokeQuotePublicLink: vi.fn(),
  generateQuotePublicLink: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  revokePublicLink: vi.fn(),
  generatePublicLink: vi.fn(),
}))
vi.mock('@/features/inspections/Actions/inspectionShareActions', () => ({
  revokeInspectionPublicLink: vi.fn(),
  generateInspectionPublicLink: vi.fn(),
}))
vi.mock('@/features/email/Actions/emailActions', () => ({
  sendQuoteEmail: vi.fn(),
  sendInvoiceEmail: vi.fn(),
  sendInspectionEmail: vi.fn(),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({
  sendSmsToCustomer: async (input: unknown) => sendSmsToCustomer(input),
  getSmsTemplates: async () => ({
    success: true,
    data: { templates: {}, companyName: 'Fjord Auto', currentUser: 'Kari' },
  }),
}))
vi.mock('@/features/email/Actions/emailPreferenceActions', () => ({
  getAttachPdfDefault: async () => ({ success: true, data: { attachPdf: true } }),
}))

import { InspectionShareDialog } from '@/features/inspections/Components/InspectionShareDialog'
import { QuoteShareDialog } from '@/features/quotes/Components/QuoteShareDialog'
import { ShareDialog } from '@/features/vehicles/Components/service-detail/ShareDialog'

const customer = { id: 'c1', name: 'Ola Nordmann', email: null, phone: '+4790000000' }
const WINDOW_CLOSED =
  'This customer has not written to you on WhatsApp in the last 24 hours, and no approved template is set up to reach them.'

function channels(whatsapp: 'ready' | 'not_connected' | 'not_in_plan', sms = 'not_connected') {
  getShareChannels.mockResolvedValue({ success: true, data: { sms, whatsapp, isCloud: true } })
}

function windowState(open: boolean, hasTemplate: boolean) {
  getWhatsappWindowState.mockResolvedValue({
    success: true,
    data: { configured: true, open, hasTemplate, hasMediaTemplate: false, lastInboundAt: null },
  })
}

async function show(dialog: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    render(<QueryClientProvider client={client}>{dialog}</QueryClientProvider>)
  })
}

async function send() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send Notification' }))
  })
}

const onOpenChange = vi.fn()
const invoice = (
  <ShareDialog
    open
    onOpenChange={onOpenChange}
    recordId="r1"
    organizationId="org1"
    initialToken="tok"
    customer={customer}
  />
)
const quote = (
  <QuoteShareDialog
    open
    onOpenChange={onOpenChange}
    quoteId="q1"
    organizationId="org1"
    initialToken="tok"
    customer={customer}
  />
)
const inspection = (
  <InspectionShareDialog
    open
    onOpenChange={onOpenChange}
    inspectionId="i1"
    organizationId="org1"
    publicToken="tok"
    customer={customer}
  />
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WhatsApp in the share dialogs', () => {
  it.each([
    ['invoice', invoice, '/share/invoice/org1/tok', 'r1'],
    ['quote', quote, '/share/quote/org1/tok', 'q1'],
    ['inspection', inspection, '/share/inspection/org1/tok', 'i1'],
  ])('sends the %s link on WhatsApp', async (type, dialog, link, id) => {
    channels('ready')
    windowState(true, false)
    sendWhatsappToCustomer.mockResolvedValue({ success: true, data: { id: 'm1' } })
    await show(dialog)

    const box = await screen.findByRole('checkbox', { name: /WhatsApp/ })
    await vi.waitFor(() => expect(box).toBeEnabled())
    fireEvent.click(box)
    await send()

    expect(sendWhatsappToCustomer).toHaveBeenCalledWith({
      customerId: 'c1',
      body: expect.stringContaining(link),
      relatedEntityType: type,
      relatedEntityId: id,
    })
    expect(sendSmsToCustomer).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('WhatsApp sent')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('offers WhatsApp outside the 24 hours when a template can carry it', async () => {
    channels('ready')
    windowState(false, true)
    await show(invoice)

    const box = await screen.findByRole('checkbox', { name: /WhatsApp/ })
    await vi.waitFor(() => expect(box).toBeEnabled())
    expect(screen.queryByText(WINDOW_CLOSED)).not.toBeInTheDocument()
  })

  it('explains the 24 hour rule when nothing can reach the customer', async () => {
    channels('ready')
    windowState(false, false)
    await show(invoice)

    expect(await screen.findByText(WINDOW_CLOSED)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /WhatsApp/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send Notification' })).toBeDisabled()
  })

  it('shows WhatsApp disabled with the way to connect it', async () => {
    channels('not_connected', 'ready')
    await show(quote)

    expect(
      await screen.findByText('Connect WhatsApp under Integrations to send this way.')
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /WhatsApp/ })).toBeDisabled()
    expect(getWhatsappWindowState).not.toHaveBeenCalled()
  })

  it('says when the plan has no WhatsApp', async () => {
    channels('not_in_plan', 'ready')
    await show(inspection)

    expect(await screen.findByText('WhatsApp is not included in your plan.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /WhatsApp/ })).toBeDisabled()
  })

  it('keeps the dialog open and says why when WhatsApp refuses the message', async () => {
    channels('ready')
    windowState(true, false)
    sendWhatsappToCustomer.mockResolvedValue({ success: false, error: 'Number not on WhatsApp' })
    await show(invoice)

    const box = await screen.findByRole('checkbox', { name: /WhatsApp/ })
    await vi.waitFor(() => expect(box).toBeEnabled())
    fireEvent.click(box)
    await send()

    expect(toast.error).toHaveBeenCalledWith('Number not on WhatsApp')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('sends a text and a WhatsApp message with the same words', async () => {
    channels('ready', 'ready')
    windowState(true, false)
    sendWhatsappToCustomer.mockResolvedValue({ success: true, data: { id: 'm1' } })
    sendSmsToCustomer.mockResolvedValue({ success: true })
    await show(invoice)

    const box = await screen.findByRole('checkbox', { name: /WhatsApp/ })
    await vi.waitFor(() => expect(box).toBeEnabled())
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('checkbox', { name: /SMS/ }))
    await send()

    const text = sendSmsToCustomer.mock.calls[0][0].body
    expect(sendWhatsappToCustomer.mock.calls[0][0].body).toBe(text)
    expect(toast.success).toHaveBeenCalledWith('SMS sent & WhatsApp sent')
  })
})
