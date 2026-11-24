/**
 * The signed-in home as Daylight draws it: the car in the workshop on top,
 * what needs an answer and what there is to pay, the chat always there on a
 * desk, stored tyres only for a workshop that stores them, and a page that
 * still looks finished when there is nothing to show.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyHome, format, fullHome } from './helpers/fixtures'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/features/portal/Actions/respondToPortalQuote', () => ({
  respondToPortalQuote: vi.fn(async () => ({ success: true, data: { status: 'accepted' } })),
}))

import { respondToPortalQuote } from '@/features/portal/Actions/respondToPortalQuote'
import { Home } from '@/features/portal/Components/Themes/Daylight/Home'
import { firstNameOf } from '@/features/portal/Lib/homeData'
import type { PortalHomeData } from '@/features/portal/Lib/homeTypes'

const home = async (data: PortalHomeData, chat: React.ReactNode = <p>The chat</p>) =>
  render(await Home({ orgParam: 'fjordside', data, format, chat }))

const [summerSet] = fullHome.tires as NonNullable<PortalHomeData['tires']>

const section = (name: string) => within(screen.getByRole('region', { name }))

beforeEach(() => {
  router.refresh.mockClear()
  vi.mocked(respondToPortalQuote).mockClear()
})

describe('the car in the workshop', () => {
  it('leads the page: which car, what for, and when it is ready', async () => {
    await home(fullHome)
    const hero = section('Hi Kari. Your car is in the workshop, ready today around 16:00.')
    expect(hero.getByText('Volvo V60')).toBeInTheDocument()
    expect(hero.getByText('EK 12345')).toBeInTheDocument()
    expect(hero.getByText('Brake service')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows the three steps with the one it is at', async () => {
    await home(fullHome)
    const steps = within(screen.getByRole('list', { name: 'How far the work has come' }))
    expect(steps.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Checked in',
      'In the workshop',
      'Ready to collect',
    ])
    expect(steps.getByText('In the workshop')).toHaveAttribute('aria-current', 'step')
    expect(steps.getByText('Ready to collect')).not.toHaveAttribute('aria-current')
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
    expect(screen.getByText('Booked')).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByText(/Latest from the workshop/)).not.toBeInTheDocument()
  })

  it('says what happens next, and whether the workshop is open, when nothing was shared yet', async () => {
    await home({ ...emptyHome, jobs: [{ ...fullHome.jobs[0], update: null }] })
    const hero = section('Hi Kari. Your car is in the workshop, ready today around 16:00.')
    expect(hero.getByText('Next')).toBeInTheDocument()
    expect(
      hero.getByText('You get a message here when it is ready to collect.')
    ).toBeInTheDocument()
    expect(hero.getByText('Open until 17:00')).toBeInTheDocument()
    expect(hero.getByRole('link', { name: '55 00 00 00' })).toHaveAttribute('href', 'tel:55000000')
  })

  it('does not promise a message to a customer of a workshop without the chat', async () => {
    await home(
      {
        ...emptyHome,
        jobs: [{ ...fullHome.jobs[0], update: null }],
        messages: { enabled: false, unread: 0, latest: [] },
      },
      null
    )
    expect(screen.getByText('We let you know when it is ready to collect.')).toBeInTheDocument()
  })

  it('greets a customer known by an initial without doubling the full stop', async () => {
    await home({
      ...emptyHome,
      customerName: 'K. Nordmann',
      customerFirstName: firstNameOf('K. Nordmann'),
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hi K. Nothing in the workshop right now.' })
    ).toBeInTheDocument()
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
})

describe('what needs an answer', () => {
  it('shows the quote, what it is for, what it costs and until when', async () => {
    await home(fullHome)
    const quote = section('Needs your answer')
    expect(quote.getByText('Front discs and pads')).toBeInTheDocument()
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
    const quote = section('Needs your answer')
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
    const quote = section('Needs your answer')
    await user.click(quote.getByRole('button', { name: 'Accept quote' }))
    await user.click(quote.getByRole('button', { name: 'Yes, accept' }))
    expect(await quote.findByRole('alert')).toHaveTextContent(
      'We could not send your answer. Try again.'
    )
    expect(quote.queryByText('server words')).not.toBeInTheDocument()

    await user.click(quote.getByRole('button', { name: 'Cancel' }))
    expect(quote.getByRole('button', { name: 'Accept quote' })).toBeInTheDocument()
  })

  it('says how many more are waiting', async () => {
    await home({
      ...fullHome,
      toAnswer: [...fullHome.toAnswer, { ...fullHome.toAnswer[0], id: 'q2' }],
    })
    expect(
      screen.getByRole('link', { name: '1 more quote is waiting for your answer' })
    ).toHaveAttribute('href', '/portal/fjordside/quotes')
  })
})

describe('what there is to pay', () => {
  it('shows the invoice with paying and reading it', async () => {
    await home(fullHome)
    const pay = section('To pay')
    expect(pay.getByText('EU inspection and service')).toBeInTheDocument()
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
    const pay = section('To pay')
    expect(pay.queryByRole('link', { name: 'Pay now' })).not.toBeInTheDocument()
    expect(pay.getByRole('link', { name: 'See the invoice' })).toBeInTheDocument()
  })

  it('says overdue and what is left after a part payment, for the one invoice there is', async () => {
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
    const pay = section('To pay')
    expect(pay.getByText('Overdue since 10/11/2026')).toBeInTheDocument()
    expect(pay.getByText('3 280 kr')).toBeInTheDocument()
    expect(pay.getByText(/1 000 kr of 4 280 kr paid/)).toBeInTheDocument()
    expect(pay.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('leads with the sum and the count when there are several, then the most urgent one', async () => {
    const invoice = fullHome.toPay[0]
    await home({
      ...fullHome,
      toPay: [
        { ...invoice, overdue: true, dueAt: '2026-11-10T11:00:00Z', balance: 3280 },
        ...Array.from({ length: 10 }, (_, n) => ({ ...invoice, id: `more-${n}`, balance: 500 })),
      ],
      toPayTotal: 8280,
      toPayCount: 11,
      toPayOverdueCount: 1,
    })
    const pay = section('To pay')
    expect(pay.getByText('8 280 kr')).toBeInTheDocument()
    expect(pay.getByText('11 invoices')).toBeInTheDocument()
    expect(pay.getByText('1 overdue')).toBeInTheDocument()
    // The one to deal with first, with its own amount and its buttons.
    expect(pay.getByText('Most urgent')).toBeInTheDocument()
    expect(pay.getByText('EU inspection and service')).toBeInTheDocument()
    expect(pay.getByText('3 280 kr')).toBeInTheDocument()
    expect(pay.getByText('Overdue since 10/11/2026')).toBeInTheDocument()
    expect(pay.getAllByRole('link', { name: 'Pay now' })).toHaveLength(1)
    expect(pay.getByRole('link', { name: 'See all 11 invoices' })).toHaveAttribute(
      'href',
      '/portal/fjordside/invoices'
    )
  })

  it('calls the first of several "next to pay" when none is overdue', async () => {
    const invoice = fullHome.toPay[0]
    await home({
      ...fullHome,
      toPay: [invoice, { ...invoice, id: 'i2', balance: 500 }],
      toPayTotal: 4780,
      toPayCount: 2,
    })
    const pay = section('To pay')
    expect(pay.getByText('Next to pay')).toBeInTheDocument()
    expect(pay.getByText('Due 28/11/2026')).toBeInTheDocument()
    expect(pay.queryByText(/overdue/i)).not.toBeInTheDocument()
  })
})

describe('the chat', () => {
  it('is on the page, in a block that says what it is', async () => {
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
  })
})

describe('tyres stored with the workshop', () => {
  it('show the season, the car, the tyre, its size, since when, and the tread left', async () => {
    await home(fullHome)
    const tires = section('Tyre hotel')
    expect(tires.getByText('Summer tyres stored with us')).toBeInTheDocument()
    expect(tires.getByText(/Toyota RAV4 · Michelin Primacy 4/)).toBeInTheDocument()
    expect(tires.getByText(/225\/60 R18 · stored since 21\/10\/2026/)).toBeInTheDocument()
    expect(tires.getByText('5 mm')).toBeInTheDocument()
    expect(tires.getByText('tread left')).toBeInTheDocument()
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
    expect(toyota).toHaveTextContent('EL 54321 · 3 visits · warranty active')
    expect(toyota).not.toHaveTextContent('In the workshop')
  })

  it('says when, which car and what for, and how to get there', async () => {
    await home(fullHome)
    const visit = section('Next visit')
    expect(visit.getByText('Thursday 3 December, 08:00')).toBeInTheDocument()
    expect(visit.getByText('Toyota RAV4 · EU inspection follow-up')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
  })
})

describe('a customer with nothing going on', () => {
  it('is greeted, told nothing is in the workshop, and offered a visit', async () => {
    await home(emptyHome)
    const hero = section('Hi Kari. Nothing in the workshop right now.')
    // The band is never half empty: the workshop's hours and number sit beside the greeting.
    expect(hero.getByText('Open until 17:00')).toBeInTheDocument()
    expect(hero.getByRole('link', { name: '55 00 00 00' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hi Kari. Nothing in the workshop right now.' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Book a visit' })[0]).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
  })

  it('shows no empty boxes for quotes, invoices or tyres', async () => {
    await home(emptyHome)
    expect(screen.queryByText('Needs your answer')).not.toBeInTheDocument()
    expect(screen.queryByText('To pay')).not.toBeInTheDocument()
    expect(screen.queryByText('Tyre hotel')).not.toBeInTheDocument()
  })

  it('says in words that no car is on file and no visit is booked', async () => {
    await home(emptyHome)
    expect(section('My cars').getByText('No cars on file yet')).toBeInTheDocument()
    const visit = section('Next visit')
    expect(visit.getByText('No visit booked')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Book a visit' })).toBeInTheDocument()
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
