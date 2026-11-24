import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A quote opened in the portal shows its title, its total in the workshop's
 * currency, its dates on the workshop's calendar, and, while it waits on the
 * customer, the buttons to answer it with.
 */

const quote = {
  id: 'q1',
  title: 'Brake overhaul',
  quoteNumber: 'Q-1001',
  status: 'sent',
  totalAmount: 4200,
  // 23:30 UTC on 30 Nov is already 1 December in Auckland.
  createdAt: '2026-11-30T23:30:00.000Z',
  validUntil: null as string | null,
  vehicle: { make: 'Volvo', model: 'V70', year: 2015 },
  awaitsAnswer: true,
  spec: {},
}

vi.mock('next-intl/server', async () => {
  const { useTranslations } = await import('next-intl')
  return { getTranslations: async (namespace: string) => useTranslations(namespace) }
})
vi.mock('@/features/portal/Actions/getPortalQuote', () => ({
  getPortalQuote: vi.fn(async () => ({ success: true, data: quote })),
}))
vi.mock('@/features/portal/Actions/respondToPortalQuote', () => ({
  respondToPortalQuote: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/features/portal/Components/PortalShell', () => ({
  PortalShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/invoice-designer/Render/SpecSheet', () => ({
  SpecSheet: () => <div data-testid="sheet" />,
}))
vi.mock('@/lib/portal-slug', () => ({ resolvePortalOrg: async () => ({ id: 'org1' }) }))
vi.mock('@/features/portal/Lib/portalFormat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/portal/Lib/portalFormat')>()
  return {
    ...actual,
    portalFormat: async () =>
      actual.buildPortalFormat({
        locale: 'en-NZ',
        timeZone: 'Pacific/Auckland',
        timeFormat: '24h',
        dateFormat: 'dd/MM/yyyy',
        money: (amount) => `NZ$${amount.toFixed(2)}`,
        today: 'Today',
        tomorrow: 'Tomorrow',
        now: new Date('2026-11-15T00:00:00Z'),
      }),
  }
})

import PortalQuotePage from '@/app/(public)/portal/[orgId]/quotes/[quoteId]/page'
import { respondToPortalQuote } from '@/features/portal/Actions/respondToPortalQuote'

async function renderPage() {
  return render(
    await PortalQuotePage({ params: Promise.resolve({ orgId: 'fjord', quoteId: 'q1' }) })
  )
}

describe('a quote in the customer portal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(respondToPortalQuote).mockImplementation(async (input) => ({
      success: true,
      data: { status: (input as { answer: 'accepted' | 'changes_requested' }).answer },
    }))
  })

  it('shows the title, the total and the day on the workshop calendar', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Brake overhaul' })).toBeInTheDocument()
    expect(screen.getByText('NZ$4200.00')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('01/12/2026')).toBeInTheDocument()
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to quotes/ })).toHaveAttribute(
      'href',
      '/portal/fjord/quotes'
    )
  })

  it('takes its colours from the portal theme, so it reads on the dark one', async () => {
    const { container } = await renderPage()
    expect(container.innerHTML).not.toMatch(
      /\b(?:text|bg|border)-(?:muted-foreground|foreground|primary|destructive|card|muted|background|border)\b/
    )
  })

  it('puts the sheet in a region that scrolls sideways on a phone instead of shrinking it', async () => {
    await renderPage()
    const region = screen.getByRole('region', { name: 'The full quote' })
    expect(region).toHaveClass('overflow-x-auto')
    expect(region).toContainElement(screen.getByTestId('sheet'))
  })

  it('lets the customer accept or ask for changes while the quote waits for an answer', async () => {
    await renderPage()
    expect(screen.getByText('The workshop is waiting for your answer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept quote' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask for changes' })).toBeInTheDocument()
    // No dead end, and no trip out of the portal to answer.
    expect(screen.queryByText(/contact the workshop/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Answer this quote/ })).not.toBeInTheDocument()
  })

  it('accepts after one confirmation and then says so', async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Accept quote' }))
    expect(respondToPortalQuote).not.toHaveBeenCalled()
    expect(screen.getByText('Accept this quote?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, accept' }))

    expect(respondToPortalQuote).toHaveBeenCalledWith({
      quoteId: 'q1',
      answer: 'accepted',
      message: undefined,
    })
    expect(await screen.findByText('You accepted this quote')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept quote' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask for changes' })).not.toBeInTheDocument()
  })

  it('sends what the customer wants changed, and not before they have said it', async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Ask for changes' }))
    const send = screen.getByRole('button', { name: 'Send to the workshop' })
    expect(send).toBeDisabled()
    await user.type(screen.getByLabelText('What would you like changed?'), 'Skip the wipers')
    await user.click(send)

    expect(respondToPortalQuote).toHaveBeenCalledWith({
      quoteId: 'q1',
      answer: 'changes_requested',
      message: 'Skip the wipers',
    })
    expect(await screen.findByText('You asked for changes')).toBeInTheDocument()
  })

  it('keeps the buttons and says so when the answer could not be sent', async () => {
    vi.mocked(respondToPortalQuote).mockResolvedValue({ success: false, error: 'nope' })
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Accept quote' }))
    await user.click(screen.getByRole('button', { name: 'Yes, accept' }))

    // Said on the page, where the buttons are, in the portal's own colours.
    expect(screen.getByRole('alert')).toHaveTextContent('We could not send your answer. Try again.')
    expect(screen.queryByText('You accepted this quote')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept quote' })).toBeInTheDocument()
  })

  it('shows no buttons on a sent quote whose last valid day has passed', async () => {
    quote.awaitsAnswer = false
    await renderPage()
    expect(screen.queryByRole('button', { name: 'Accept quote' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask for changes' })).not.toBeInTheDocument()
    expect(screen.queryByText('The workshop is waiting for your answer')).not.toBeInTheDocument()
    quote.awaitsAnswer = true
  })

  it('asks nothing of the customer once the quote is accepted', async () => {
    quote.status = 'accepted'
    quote.awaitsAnswer = false
    await renderPage()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('You accepted this quote')).toBeInTheDocument()
    expect(screen.queryByText('The workshop is waiting for your answer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept quote' })).not.toBeInTheDocument()
    quote.status = 'sent'
    quote.awaitsAnswer = true
  })
})
