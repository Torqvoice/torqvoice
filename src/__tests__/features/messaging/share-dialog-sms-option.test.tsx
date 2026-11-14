/**
 * The share dialogs used to leave SMS out when the workshop could not send
 * one, so nobody learned that a quote or an invoice can go out by text. Now
 * the option is always there: ticked and sent when SMS works, and disabled
 * with the reason and the way to fix it when it does not.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getShareChannels = vi.fn()
const sendSmsToCustomer = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/features/messaging/Actions/getShareChannels', () => ({
  getShareChannels: async () => getShareChannels(),
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

function channels(sms: 'ready' | 'not_connected' | 'not_in_plan', isCloud = false) {
  getShareChannels.mockResolvedValue({ success: true, data: { sms, isCloud } })
}

async function show(dialog: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    render(<QueryClientProvider client={client}>{dialog}</QueryClientProvider>)
  })
}

const invoice = (c = customer) => (
  <ShareDialog
    open
    onOpenChange={vi.fn()}
    recordId="r1"
    organizationId="org1"
    initialToken="tok"
    customer={c}
  />
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SMS in the invoice share dialog', () => {
  it('sends the link by text when SMS is set up', async () => {
    channels('ready')
    sendSmsToCustomer.mockResolvedValue({ success: true })
    await show(invoice())

    const sms = await screen.findByRole('checkbox', { name: /SMS/ })
    expect(sms).toBeEnabled()
    fireEvent.click(sms)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send Notification' }))
    })

    expect(sendSmsToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'c1',
        body: expect.stringContaining('/share/invoice/org1/tok'),
      })
    )
  })

  it('shows SMS disabled with the way to connect a provider', async () => {
    channels('not_connected')
    await show(invoice())

    expect(
      await screen.findByText('Connect SMS under Integrations to send this way.')
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /SMS/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open Integrations' })).toHaveAttribute(
      'href',
      '/settings/integrations'
    )
    expect(screen.getByRole('button', { name: 'Send Notification' })).toBeDisabled()
  })

  it('points a cloud workshop without SMS in its plan to the plans', async () => {
    channels('not_in_plan', true)
    await show(invoice())

    expect(await screen.findByText('SMS is not included in your plan.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /SMS/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/settings/subscription'
    )
  })

  it('points a self-hosted workshop without SMS to the licence page', async () => {
    channels('not_in_plan', false)
    await show(invoice())

    expect(await screen.findByRole('link', { name: 'Activate License' })).toHaveAttribute(
      'href',
      '/settings/license'
    )
  })

  it('says the customer has no phone when that is what is missing', async () => {
    channels('ready')
    await show(invoice({ ...customer, phone: null as unknown as string }))

    expect(await screen.findByText('(no phone on file)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /SMS/ })).toBeDisabled()
  })
})

describe('SMS in the quote and inspection share dialogs', () => {
  it('shows the quote dialog the same hint', async () => {
    channels('not_connected')
    await show(
      <QuoteShareDialog
        open
        onOpenChange={vi.fn()}
        quoteId="q1"
        organizationId="org1"
        initialToken="tok"
        customer={customer}
      />
    )

    expect(
      await screen.findByText('Connect SMS under Integrations to send this way.')
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /SMS/ })).toBeDisabled()
  })

  it('shows the inspection dialog the same hint', async () => {
    channels('not_connected')
    await show(
      <InspectionShareDialog
        open
        onOpenChange={vi.fn()}
        inspectionId="i1"
        organizationId="org1"
        publicToken="tok"
        customer={customer}
      />
    )

    expect(
      await screen.findByText('Connect SMS under Integrations to send this way.')
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /SMS/ })).toBeDisabled()
  })
})
