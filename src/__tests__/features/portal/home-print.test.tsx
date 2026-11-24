/**
 * The Print theme, as a customer meets it: a page with a dateline on the
 * workshop's clock, the car in the workshop as the headline, a ledger of
 * what waits for an answer or a payment, ruled columns for the cars, the
 * next visit and stored tyres, the chat in a column of its own on a desk,
 * and a page that still reads as finished when there is nothing to show.
 * Then its masthead and tabs, and its sign-in page.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyHome, format, fullHome, now, workshop } from './helpers/fixtures'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
const path = vi.hoisted(() => ({ current: '/portal/fjordside/dashboard' }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => path.current,
}))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/features/portal/Actions/respondToPortalQuote', () => ({
  respondToPortalQuote: vi.fn(async () => ({ success: true, data: { status: 'accepted' } })),
}))

import { respondToPortalQuote } from '@/features/portal/Actions/respondToPortalQuote'
import { Chrome } from '@/features/portal/Components/Themes/Print/Chrome'
import { Home } from '@/features/portal/Components/Themes/Print/Home'
import { SignIn } from '@/features/portal/Components/Themes/Print/SignIn'
import type { PortalSignInProps } from '@/features/portal/Components/Themes/types'
import type { PortalHomeData } from '@/features/portal/Lib/homeTypes'

const home = async (data: PortalHomeData, chat: React.ReactNode = <p>The chat</p>) =>
  render(await Home({ orgParam: 'fjordside', data, format, chat }))

const [summerSet] = fullHome.tires as NonNullable<PortalHomeData['tires']>

const section = (name: string) => within(screen.getByRole('region', { name }))
/** The ledger line that holds a title. */
const ledgerRow = (title: string) => {
  const row = screen.getByText(title).closest('li')
  if (!row) throw new Error(`No ledger line for ${title}`)
  return within(row)
}

beforeEach(() => {
  // Only the clock is held still: the page prints the day and the time.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  router.refresh.mockClear()
  vi.mocked(respondToPortalQuote).mockClear()
  path.current = '/portal/fjordside/dashboard'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the dateline', () => {
  it('prints the day on the workshop clock, where the workshop is and who is reading', async () => {
    await home(fullHome)
    expect(screen.getByText('Saturday 14 November')).toBeInTheDocument()
    expect(screen.getByText('Strandgaten 14, Bergen · 55 00 00 00')).toBeInTheDocument()
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument()
    expect(screen.getByText('Open until 17:00')).toBeInTheDocument()
  })

  it('is on the workshop day, not the server day, late in the evening', async () => {
    // 23:30 UTC on the 14th is already Sunday the 15th in Oslo.
    vi.setSystemTime(new Date('2026-11-14T23:30:00Z'))
    await home(fullHome)
    expect(screen.getByText('Sunday 15 November')).toBeInTheDocument()
    expect(screen.getByText('Fjordside Auto, 00:30.')).toBeInTheDocument()
  })

  it('leaves out an address and a phone the workshop never gave', async () => {
    await home({
      ...fullHome,
      nextVisit: null,
      workshop: { ...workshop, address: null, directionsUrl: null, phone: null, phoneHref: null },
    })
    expect(screen.getByText('Saturday 14 November')).toBeInTheDocument()
    expect(screen.queryByText(/Strandgaten/)).not.toBeInTheDocument()
  })
})

describe('the car in the workshop', () => {
  it('is the headline: which car, what for, when it is ready, and when that was true', async () => {
    await home(fullHome)
    const lead = section('Hi Kari. Your car is in the workshop, ready today around 16:00.')
    expect(lead.getByText('Your car')).toBeInTheDocument()
    expect(lead.getByText('Volvo V60 · EK 12345 · Brake service')).toBeInTheDocument()
    expect(lead.getByText('Fjordside Auto, 11:00.')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows the three steps, each with where it stands', async () => {
    await home(fullHome)
    const steps = within(screen.getByRole('list', { name: 'How far the work has come' }))
    expect(steps.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'DoneChecked in',
      'NowIn the workshop',
      'Not yetReady to collect',
    ])
    expect(steps.getByText('In the workshop').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(steps.getByText('Ready to collect').closest('li')).not.toHaveAttribute('aria-current')
  })

  it('carries the latest update with a way to see it', async () => {
    await home(fullHome)
    expect(screen.getByText('Latest from the workshop · 10:12')).toBeInTheDocument()
    expect(screen.getByText(/Front discs are worn past the limit/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See photos and video' })).toHaveAttribute(
      'href',
      '/share/status-report/fjordside/tok'
    )
  })

  it('says when the car is expected, for a visit that is only booked', async () => {
    await home({
      ...emptyHome,
      jobs: [
        {
          ...fullHome.jobs[0],
          status: 'scheduled',
          stage: 'booked',
          promisedAt: null,
          update: null,
          startAt: '2026-11-15T07:00:00Z',
        },
      ],
    })
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Hi Kari. We are expecting your car tomorrow at 08:00.',
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Booked').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByText(/Latest from the workshop/)).not.toBeInTheDocument()
  })

  it('does not repeat a promise whose day has passed', async () => {
    await home({
      ...emptyHome,
      jobs: [{ ...fullHome.jobs[0], promisedAt: '2026-11-12T15:00:00Z', update: null }],
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hi Kari. Your car is in the workshop.' })
    ).toBeInTheDocument()
  })

  it('says boat for a marine workshop', async () => {
    await home({ ...fullHome, marine: true })
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Hi Kari. Your boat is in the workshop, ready today around 16:00.',
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Your boat')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My boats' })).toBeInTheDocument()
  })

  it('lists any other work under way or booked, each with where it stands', async () => {
    await home({
      ...fullHome,
      jobs: [
        ...fullHome.jobs,
        {
          ...fullHome.jobs[0],
          id: 'j9',
          title: 'Wheel alignment',
          status: 'scheduled',
          stage: 'booked',
          startAt: '2026-11-20T08:00:00Z',
          promisedAt: null,
          update: null,
        },
      ],
    })
    const other = section('Also booked or under way')
    expect(other.getByText('Wheel alignment')).toBeInTheDocument()
    expect(other.getByText('Volvo V60 · Booked for 20/11/2026 at 09:00')).toBeInTheDocument()
  })

  it('prints a long job title and a long workshop name in full', async () => {
    const title =
      'Timing belt, water pump, auxiliary belt and tensioner replacement with coolant flush'
    const name = 'Fjordside Auto and Marine Service Centre of Greater Bergen and Hordaland'
    await home({
      ...fullHome,
      workshop: { ...workshop, name },
      jobs: [{ ...fullHome.jobs[0], title }],
    })
    expect(screen.getByText(`Volvo V60 · EK 12345 · ${title}`)).toBeInTheDocument()
    expect(screen.getByText(`${name}, 11:00.`)).toBeInTheDocument()
  })
})

describe('the ledger of what waits for the customer', () => {
  it('counts what is waiting and names its columns', async () => {
    await home(fullHome)
    const ledger = section('Waiting for you')
    expect(ledger.getByText('2 items · 4 280 kr to pay on 1 invoice')).toBeInTheDocument()
    expect(ledger.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows the quote, what it is for, what it costs and until when', async () => {
    await home(fullHome)
    const quote = ledgerRow('Front discs and pads')
    expect(quote.getByText('Needs your answer')).toBeInTheDocument()
    expect(quote.getByText('4 850 kr')).toBeInTheDocument()
    expect(quote.getByText('Valid until 29/11/2026')).toBeInTheDocument()
    expect(quote.getByText('Quote Q-2041 · Volvo V60')).toBeInTheDocument()
    expect(quote.getByRole('link', { name: 'Read the quote' })).toHaveAttribute(
      'href',
      '/portal/fjordside/quotes/q1'
    )
  })

  it('accepts the quote only after the customer confirms', async () => {
    const user = userEvent.setup()
    await home(fullHome)
    const quote = ledgerRow('Front discs and pads')
    await user.click(quote.getByRole('button', { name: 'Accept quote' }))
    expect(respondToPortalQuote).not.toHaveBeenCalled()
    expect(quote.getByText('Accept this quote?')).toBeInTheDocument()

    await user.click(quote.getByRole('button', { name: 'Yes, accept' }))
    expect(respondToPortalQuote).toHaveBeenCalledWith({ quoteId: 'q1', answer: 'accepted' })
    expect(await quote.findByRole('status')).toHaveTextContent('You accepted this quote')
    expect(router.refresh).toHaveBeenCalled()
  })

  it('lets the customer back out, and says so when the answer could not be sent', async () => {
    const user = userEvent.setup()
    vi.mocked(respondToPortalQuote).mockResolvedValueOnce({ success: false, error: 'server words' })
    await home(fullHome)
    const quote = ledgerRow('Front discs and pads')
    await user.click(quote.getByRole('button', { name: 'Accept quote' }))
    await user.click(quote.getByRole('button', { name: 'Yes, accept' }))
    expect(await quote.findByRole('alert')).toHaveTextContent(
      'We could not send your answer. Try again.'
    )
    expect(quote.queryByText('server words')).not.toBeInTheDocument()

    await user.click(quote.getByRole('button', { name: 'Cancel' }))
    expect(quote.getByRole('button', { name: 'Accept quote' })).toBeInTheDocument()
  })

  it('shows the invoice with paying and reading it', async () => {
    await home(fullHome)
    const pay = ledgerRow('EU inspection and service')
    expect(pay.getByText('To pay')).toBeInTheDocument()
    expect(pay.getByText('4 280 kr')).toBeInTheDocument()
    expect(pay.getByText('Due 28/11/2026')).toBeInTheDocument()
    expect(pay.getByText('Invoice 1042 · Toyota RAV4 · 09/11/2026')).toBeInTheDocument()
    expect(pay.getByRole('link', { name: 'Pay now' })).toHaveAttribute(
      'href',
      '/share/invoice/fjordside/tok-i1'
    )
    expect(pay.getByRole('link', { name: 'See the invoice' })).toHaveAttribute(
      'href',
      '/portal/fjordside/invoices/i1'
    )
  })

  it('offers no Pay now where the invoice cannot be paid online', async () => {
    await home({ ...fullHome, toPay: [{ ...fullHome.toPay[0], payUrl: null }] })
    const pay = ledgerRow('EU inspection and service')
    expect(pay.queryByRole('link', { name: 'Pay now' })).not.toBeInTheDocument()
    expect(pay.getByRole('link', { name: 'See the invoice' })).toBeInTheDocument()
  })

  it('says overdue and what is left after a part payment', async () => {
    await home({
      ...fullHome,
      toPay: [
        {
          ...fullHome.toPay[0],
          overdue: true,
          dueAt: '2026-11-10T11:00:00Z',
          paid: 1000,
          balance: 3280,
        },
      ],
      toPayTotal: 3280,
      toPayOverdueCount: 1,
    })
    expect(
      section('Waiting for you').getByText('2 items · 3 280 kr to pay on 1 invoice · 1 overdue')
    ).toBeInTheDocument()
    const pay = ledgerRow('EU inspection and service')
    expect(pay.getByText('Overdue since 10/11/2026')).toBeInTheDocument()
    expect(pay.getByText('3 280 kr')).toBeInTheDocument()
    expect(pay.getByText(/1 000 kr of 4 280 kr paid/)).toBeInTheDocument()
  })

  it('lists three of each and says how many more there are', async () => {
    const quotes = ['q1', 'q2', 'q3', 'q4'].map((id) => ({
      ...fullHome.toAnswer[0],
      id,
      title: `Quote ${id}`,
    }))
    const invoices = ['i1', 'i2', 'i3', 'i4', 'i5'].map((id) => ({
      ...fullHome.toPay[0],
      id,
      title: `Invoice ${id}`,
      balance: 500,
    }))
    await home({ ...fullHome, toAnswer: quotes, toPay: invoices, toPayTotal: 2500, toPayCount: 5 })
    const ledger = section('Waiting for you')
    expect(ledger.getByText('9 items · 2 500 kr to pay on 5 invoices')).toBeInTheDocument()
    expect(ledger.getAllByRole('listitem')).toHaveLength(6)
    expect(ledger.queryByText('Quote q4')).not.toBeInTheDocument()
    expect(
      ledger.getByRole('link', { name: '1 more quote is waiting for your answer' })
    ).toHaveAttribute('href', '/portal/fjordside/quotes')
    expect(
      ledger.getByRole('link', { name: '2 more invoices to pay, 2 500 kr in all' })
    ).toHaveAttribute('href', '/portal/fjordside/invoices')
  })

  it('is a ledger of invoices alone when no quote waits, and of quotes alone', async () => {
    const { unmount } = await home({ ...fullHome, toAnswer: [] })
    expect(
      section('Waiting for you').getByText('1 item · 4 280 kr to pay on 1 invoice')
    ).toBeInTheDocument()
    expect(screen.queryByText('Needs your answer')).not.toBeInTheDocument()
    unmount()

    await home({ ...fullHome, toPay: [], toPayTotal: 0, toPayCount: 0 })
    expect(section('Waiting for you').getByText('1 item')).toBeInTheDocument()
    expect(screen.queryByText('To pay')).not.toBeInTheDocument()
  })
})

describe('the chat', () => {
  it('stands in a column of its own that says what it is', async () => {
    await home(fullHome)
    const chat = screen.getByRole('complementary', { name: 'Messages with Fjordside Auto' })
    expect(within(chat).getByText('The chat')).toBeInTheDocument()
  })

  it('shows the latest message as one line that opens the chat, for a phone', async () => {
    await home(fullHome)
    const preview = screen.getByRole('link', { name: /Open your messages with Fjordside Auto/ })
    expect(preview).toHaveAttribute('href', '/portal/fjordside/messages')
    expect(preview).toHaveTextContent('Jonas: You will get a message here when it is ready.')
    expect(preview).toHaveTextContent('10:34')
  })

  it('invites a first message when nothing has been written yet', async () => {
    await home(emptyHome)
    expect(
      screen.getByRole('link', { name: /Open your messages with Fjordside Auto/ })
    ).toHaveTextContent('Write to Fjordside Auto')
  })

  it('is nowhere on the page when the workshop turned it off', async () => {
    await home({ ...fullHome, messages: { enabled: false, unread: 0, latest: [] } }, null)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /messages/i })).not.toBeInTheDocument()
    // The rest of the page is all there.
    expect(section('Waiting for you').getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'My cars' })).toBeInTheDocument()
  })
})

describe('tyres stored with the workshop', () => {
  it('show the season, the car, the tyre, its size, the set, since when, and the tread left', async () => {
    await home(fullHome)
    const tires = section('Tyre hotel')
    expect(tires.getByText('Summer tyres stored with us')).toBeInTheDocument()
    expect(tires.getByText('stored since 21/10/2026')).toBeInTheDocument()
    const fact = (label: string) => tires.getByText(label).nextElementSibling
    expect(fact('Car')).toHaveTextContent('Toyota RAV4')
    expect(fact('Tyre')).toHaveTextContent('Michelin Primacy 4')
    expect(fact('Size')).toHaveTextContent('225/60 R18')
    expect(fact('Set')).toHaveTextContent('4 tyres')
    expect(fact('Tread')).toHaveTextContent('5 mm tread left')
  })

  it('are not mentioned when the workshop runs no tyre hotel', async () => {
    await home({ ...fullHome, tires: null })
    expect(screen.queryByText(/tyre/i)).not.toBeInTheDocument()
  })

  it('are not mentioned when the tyre hotel is on and nothing is stored', async () => {
    await home({ ...fullHome, tires: [] })
    expect(screen.queryByText(/tyre/i)).not.toBeInTheDocument()
  })

  it('say so when the tread was never measured, and list a second set', async () => {
    await home({
      ...fullHome,
      tires: [
        { ...summerSet, treadDepthMm: null },
        { ...summerSet, id: 't2', season: 'winter', studded: true, treadDepthMm: 6.5 },
      ],
    })
    const tires = section('Tyre hotel')
    expect(tires.getByText('Tread not measured yet')).toBeInTheDocument()
    expect(tires.getByText('Winter tyres')).toBeInTheDocument()
    expect(tires.getByText(/studded.*6.5 mm tread left/)).toBeInTheDocument()
  })
})

describe('the cars and the next visit', () => {
  it('links each car, with how often it has been in and what is going on with it', async () => {
    await home(fullHome)
    const cars = section('My cars')
    const volvo = cars.getByRole('link', { name: /Volvo V60/ })
    expect(volvo).toHaveAttribute('href', '/portal/fjordside/vehicles/v60')
    expect(volvo).toHaveTextContent('EK 12345 · 8 visits')
    expect(volvo).toHaveTextContent('In the workshop')
    const toyota = cars.getByRole('link', { name: /Toyota RAV4/ })
    expect(toyota).toHaveTextContent('EL 54321 · 3 visits')
    expect(toyota).toHaveTextContent('warranty active')
    expect(toyota).not.toHaveTextContent('In the workshop')
  })

  it('says when, which car and what for, and how to get there', async () => {
    await home(fullHome)
    const visit = section('Next visit')
    expect(visit.getByText('Thursday 3 December, 08:00')).toBeInTheDocument()
    expect(visit.getByText('Toyota RAV4 · EU inspection follow-up')).toBeInTheDocument()
    expect(visit.getByText('Strandgaten 14, Bergen')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
  })

  it('offers a visit beside a car that is in, when none is booked after it', async () => {
    await home({ ...fullHome, nextVisit: null })
    const visit = section('Next visit')
    expect(visit.getByText('No visit booked')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
  })
})

describe('a customer with no car in the workshop', () => {
  it('leads with the next visit when one is booked, and tells it once', async () => {
    await home({ ...fullHome, jobs: [] })
    const lead = section('Thursday 3 December, 08:00')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Thursday 3 December, 08:00' })
    ).toBeInTheDocument()
    expect(lead.getByText('Next visit')).toBeInTheDocument()
    expect(lead.getByText('Toyota RAV4 · EU inspection follow-up')).toBeInTheDocument()
    expect(lead.getByRole('link', { name: 'Directions' })).toBeInTheDocument()
    expect(lead.getByText('Hi Kari. Nothing in the workshop right now.')).toBeInTheDocument()
    expect(screen.getAllByText('Thursday 3 December, 08:00')).toHaveLength(1)
  })

  it('is greeted, told nothing is in the workshop, and offered a visit', async () => {
    await home(emptyHome)
    const lead = section('Hi Kari. Nothing in the workshop right now.')
    expect(
      lead.getByText('Book a visit when your car needs us. You follow the work here, step by step.')
    ).toBeInTheDocument()
    expect(lead.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
    expect(screen.getAllByRole('link', { name: 'Book a visit' })).toHaveLength(1)
  })

  it('shows no empty ledger and nothing about tyres', async () => {
    await home(emptyHome)
    expect(screen.queryByText('Waiting for you')).not.toBeInTheDocument()
    expect(screen.queryByText('Needs your answer')).not.toBeInTheDocument()
    expect(screen.queryByText('To pay')).not.toBeInTheDocument()
    expect(screen.queryByText('Tyre hotel')).not.toBeInTheDocument()
  })

  it('says in words that no car is on file', async () => {
    await home(emptyHome)
    expect(section('My cars').getByText('No cars on file yet')).toBeInTheDocument()
  })

  it('shows what they asked for and are waiting to hear about', async () => {
    await home({
      ...emptyHome,
      requests: [
        {
          id: 'r1',
          description: 'Winter tyres on, and a look at the wipers',
          vehicle: null,
          createdAt: '2026-11-12T09:00:00Z',
          preferredDate: null,
        },
      ],
    })
    const sent = section('Sent to the workshop')
    expect(sent.getByText('Winter tyres on, and a look at the wipers')).toBeInTheDocument()
    expect(sent.getByText('Sent 12/11/2026 · Waiting for an answer')).toBeInTheDocument()
  })
})

describe('the masthead and the tabs', () => {
  const chrome = (over: Partial<React.ComponentProps<typeof Chrome>> = {}) =>
    render(
      <Chrome
        orgParam="fjordside"
        workshop={workshop}
        customerName="Kari Nordmann"
        marine={false}
        messagesEnabled
        unreadMessages={1}
        {...over}
      >
        <p>The page</p>
      </Chrome>
    )

  it('names the workshop, says whether it is open, and offers a visit and the way out', () => {
    chrome()
    const masthead = within(screen.getByRole('banner'))
    expect(masthead.getByRole('link', { name: 'Fjordside Auto, home' })).toHaveAttribute(
      'href',
      '/portal/fjordside/dashboard'
    )
    expect(masthead.getByText('Open until 17:00')).toBeInTheDocument()
    expect(masthead.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
    expect(
      masthead.getByRole('button', { name: 'Your account, Kari Nordmann' })
    ).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('The page')).toBeInTheDocument()
  })

  it('has the five places along the bottom, with the unread count on Messages', () => {
    chrome()
    const [, tabs] = screen.getAllByRole('navigation', { name: 'Main' })
    const links = within(tabs).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      '11 unread messageMessages',
      'Book',
      'My cars',
      'Papers',
    ])
    expect(links[0]).toHaveAttribute('aria-current', 'page')
    expect(links[2]).toHaveAttribute('href', '/portal/fjordside/request-service')
    expect(links[4]).toHaveAttribute('href', '/portal/fjordside/documents')
  })

  it('marks the place being read, and says boats for a marine workshop', () => {
    path.current = '/portal/fjordside/invoices/i1'
    chrome({ marine: true })
    const [masthead, tabs] = screen.getAllByRole('navigation', { name: 'Main' })
    expect(within(masthead).getByRole('link', { name: 'Invoices and quotes' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(within(masthead).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(within(tabs).getByRole('link', { name: 'Papers' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(within(tabs).getByRole('link', { name: 'My boats' })).toBeInTheDocument()
  })

  it('has no Messages anywhere when the workshop turned the chat off', () => {
    chrome({ messagesEnabled: false, unreadMessages: 0 })
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument()
    const [, tabs] = screen.getAllByRole('navigation', { name: 'Main' })
    expect(within(tabs).getAllByRole('link')).toHaveLength(4)
  })

  it('offers no choice of theme or view', () => {
    chrome()
    expect(screen.queryByText(/theme|view|layout/i)).not.toBeInTheDocument()
  })
})

describe('the sign-in page', () => {
  /** Mon to Fri 07:30 to 17:00, Saturday 09:00 to 13:00, Sunday closed. Sunday first. */
  const week = [
    { open: false, start: '09:00', end: '13:00' },
    ...Array.from({ length: 5 }, () => ({ open: true, start: '07:30', end: '17:00' })),
    { open: true, start: '09:00', end: '13:00' },
  ]
  // A Saturday.
  const hours = { week, today: '2026-11-14', timeFormat: '24h' as const, closedSoon: [] }

  const signIn = async (over: Partial<PortalSignInProps> = {}) =>
    render(
      await SignIn({
        orgParam: 'fjordside',
        workshop: { ...workshop, hours },
        description: 'Family-run workshop in Bergen since 1998.',
        hoursText: null,
        coverUrl: '/api/public/portal-bg/org1?v=cover.jpg',
        eyebrow: 'For our customers',
        heading: 'See your car, your invoices and your messages.',
        children: <p>The form</p>,
        ...over,
      })
    )

  it('is the workshop front page: its name, its own words, the day and whether it is open', async () => {
    await signIn()
    expect(screen.getByRole('heading', { level: 1, name: 'Fjordside Auto' })).toBeInTheDocument()
    expect(screen.getByText('Family-run workshop in Bergen since 1998.')).toBeInTheDocument()
    // The day the workshop's calendar says it is, in the portal's language ("en" here).
    expect(screen.getByText('Saturday, November 14')).toBeInTheDocument()
    expect(screen.getByText('Customer portal')).toBeInTheDocument()
    expect(screen.getAllByText('Open until 17:00').length).toBeGreaterThan(0)
  })

  it('puts the sign-in under what it gives', async () => {
    await signIn()
    const main = within(screen.getByRole('main'))
    expect(main.getByText('For our customers')).toBeInTheDocument()
    expect(
      main.getByRole('heading', {
        level: 2,
        name: 'See your car, your invoices and your messages.',
      })
    ).toBeInTheDocument()
    expect(main.getByText('The form')).toBeInTheDocument()
  })

  it('prints the week with today marked, the address with directions, and the phone', async () => {
    await signIn()
    const opening = section('Opening hours')
    expect(opening.getByText('Mon to Fri')).toBeInTheDocument()
    expect(opening.getByText('07:30 to 17:00')).toBeInTheDocument()
    expect(opening.getByText('Saturday').closest('div')).toHaveAttribute('aria-current', 'date')
    expect(opening.getByText('Mon to Fri').closest('div')).not.toHaveAttribute('aria-current')

    const find = section('Find us')
    expect(find.getByText('Strandgaten 14, Bergen')).toBeInTheDocument()
    expect(find.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )

    const call = section('Call us')
    expect(call.getByText('55 00 00 00')).toBeInTheDocument()
    expect(call.getByRole('link', { name: 'Call the workshop' })).toHaveAttribute(
      'href',
      'tel:55000000'
    )
  })

  it('shows the cover photo the workshop uploaded, and none it did not', async () => {
    const { container, unmount } = await signIn()
    expect(
      container.querySelector('img[src="/api/public/portal-bg/org1?v=cover.jpg"]')
    ).toBeTruthy()
    unmount()

    const bare = await signIn({ coverUrl: null })
    expect(bare.container.querySelector('img')).toBeNull()
    expect(screen.getByText('The form')).toBeInTheDocument()
  })

  it('prints the hours as the workshop typed them when it never set its week', async () => {
    await signIn({ workshop: { ...workshop, hours: null }, hoursText: 'Weekdays 8 to 4' })
    expect(section('Opening hours').getByText('Weekdays 8 to 4')).toBeInTheDocument()
    // Without the calendar there is no day to print: nothing is guessed from the server clock.
    expect(screen.queryByText(/November/)).not.toBeInTheDocument()
  })

  it('is still a finished page for a workshop that gave nothing but its name', async () => {
    await signIn({
      workshop: {
        ...workshop,
        hours: null,
        phone: null,
        phoneHref: null,
        address: null,
        directionsUrl: null,
      },
      description: null,
      coverUrl: null,
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Fjordside Auto' })).toBeInTheDocument()
    expect(screen.getByText('The form')).toBeInTheDocument()
    expect(screen.queryByText('Opening hours')).not.toBeInTheDocument()
    expect(screen.queryByText('Find us')).not.toBeInTheDocument()
    expect(screen.queryByText('Call us')).not.toBeInTheDocument()
  })
})
