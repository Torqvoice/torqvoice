/**
 * The portal as Garage draws it: a pit board. The time the car is ready as
 * one numeral over a three-cell status board, what needs an answer and what
 * there is to pay, the chat always there on a desk, stored tyres only for a
 * workshop that stores them, and a board that still reads as finished when
 * there is nothing on it. Then its frame and its front door.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyHome, format, fullHome, workshop } from './helpers/fixtures'

const nav = vi.hoisted(() => ({ pathname: '/portal/fjordside/dashboard' }))
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
}))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/features/portal/Actions/respondToPortalQuote', () => ({
  respondToPortalQuote: vi.fn(async () => ({ success: true, data: { status: 'accepted' } })),
}))
// The badge's live count is the chat's business; here it is what the server counted.
vi.mock('@/features/portal/Components/Chat/usePortalUnread', () => ({
  usePortalUnread: (_org: string, initial: number) => initial,
}))

import { respondToPortalQuote } from '@/features/portal/Actions/respondToPortalQuote'
import { Chrome } from '@/features/portal/Components/Themes/Garage/Chrome'
import { Home } from '@/features/portal/Components/Themes/Garage/Home'
import { SignIn } from '@/features/portal/Components/Themes/Garage/SignIn'
import type {
  PortalChromeProps,
  PortalSignInProps,
} from '@/features/portal/Components/Themes/types'
import type { PortalHomeData } from '@/features/portal/Lib/homeTypes'

const home = async (data: PortalHomeData, chat: React.ReactNode = <p>The chat</p>) =>
  render(await Home({ orgParam: 'fjordside', data, format, chat }))

const [summerSet] = fullHome.tires as NonNullable<PortalHomeData['tires']>
const bookedJob = {
  ...fullHome.jobs[0],
  status: 'scheduled',
  stage: 'booked' as const,
  promisedAt: null,
  update: null,
  startAt: '2026-11-15T07:00:00Z',
}

const section = (name: string) => within(screen.getByRole('region', { name }))

/** What a row of a spec sheet says: the value beside a label. */
const spec = (scope: ReturnType<typeof within>, label: string) =>
  scope.getByText(label, { selector: 'dt' }).nextElementSibling

beforeEach(() => {
  nav.pathname = '/portal/fjordside/dashboard'
  router.refresh.mockClear()
  vi.mocked(respondToPortalQuote).mockClear()
})

describe('the car in the workshop', () => {
  it('leads the board: which car, what for, and when it is ready as one large time', async () => {
    await home(fullHome)
    const hero = section('Hi Kari. Your car is in the workshop, ready today around 16:00.')
    expect(hero.getByText('Volvo V60')).toBeInTheDocument()
    expect(hero.getByText('EK 12345')).toBeInTheDocument()
    expect(hero.getAllByText('Brake service').length).toBeGreaterThan(0)
    expect(hero.getByText('Ready today around')).toBeInTheDocument()
    expect(hero.getByText('16:00')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows the three steps as a board with the one it is at marked Now', async () => {
    await home(fullHome)
    const steps = within(screen.getByRole('list', { name: 'How far the work has come' }))
    const [first, second, third] = steps.getAllByRole('listitem')
    expect(first).toHaveTextContent('Checked in')
    expect(first).toHaveTextContent('Done')
    expect(second).toHaveTextContent('In the workshop')
    expect(second).toHaveTextContent('Now')
    expect(second).toHaveAttribute('aria-current', 'step')
    expect(third).toHaveTextContent('Ready to collect')
    expect(third).toHaveTextContent('Not yet, around 16:00')
    expect(first).not.toHaveAttribute('aria-current')
    expect(third).not.toHaveAttribute('aria-current')
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
    await home({ ...emptyHome, jobs: [bookedJob] })
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Hi Kari. We are expecting your car tomorrow at 08:00.',
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Expected tomorrow at')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
    const [first, second] = within(
      screen.getByRole('list', { name: 'How far the work has come' })
    ).getAllByRole('listitem')
    expect(first).toHaveTextContent('Booked')
    expect(first).toHaveAttribute('aria-current', 'step')
    expect(second).toHaveTextContent('Not yet')
    expect(screen.queryByText(/Latest from the workshop/)).not.toBeInTheDocument()
  })

  it('says it in words, with no time, once the promised day has passed', async () => {
    await home({
      ...emptyHome,
      jobs: [{ ...fullHome.jobs[0], promisedAt: '2026-11-12T15:00:00Z', update: null }],
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hi Kari. Your car is in the workshop.' })
    ).toBeVisible()
    expect(screen.queryByText(/Ready .* around/)).not.toBeInTheDocument()
    expect(screen.getByText('Not yet')).toBeInTheDocument()
  })

  it('fills the last cell once the car is ready to collect', async () => {
    await home({
      ...emptyHome,
      jobs: [{ ...fullHome.jobs[0], stage: 'ready', update: null }],
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hi Kari. Your car is ready to collect.' })
    ).toBeInTheDocument()
    const cells = within(
      screen.getByRole('list', { name: 'How far the work has come' })
    ).getAllByRole('listitem')
    expect(cells[2]).toHaveAttribute('aria-current', 'step')
    expect(cells[2]).toHaveTextContent('Now')
    expect(cells[0]).toHaveTextContent('Done')
    expect(cells[1]).toHaveTextContent('Done')
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
    expect(spec(section('Tyre hotel'), 'Boat')).toHaveTextContent('Toyota RAV4')
  })

  it('lists any other work under way or booked, each with where it stands', async () => {
    await home({
      ...fullHome,
      jobs: [
        ...fullHome.jobs,
        {
          ...bookedJob,
          id: 'j9',
          title: 'Wheel alignment',
          startAt: '2026-11-20T08:00:00Z',
        },
      ],
    })
    const other = section('Also booked or under way')
    expect(other.getByText('Wheel alignment')).toBeInTheDocument()
    expect(other.getByText('Volvo V60 · Booked for 20 Nov at 09:00')).toBeInTheDocument()
    expect(other.getByRole('link', { name: /Wheel alignment/ })).toHaveAttribute(
      'href',
      '/portal/fjordside/vehicles/v60'
    )
  })

  it('keeps a long job title and a long car name whole', async () => {
    const title = 'Timing belt, water pump, tensioner and all four brake discs with pads'
    await home({
      ...fullHome,
      jobs: [
        {
          ...fullHome.jobs[0],
          title,
          vehicle: { id: 'v60', label: 'Mercedes-Benz Sprinter 316 CDI', licensePlate: 'EK 12345' },
        },
      ],
    })
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    expect(screen.getByText('Mercedes-Benz Sprinter 316 CDI')).toBeInTheDocument()
  })
})

describe('what needs an answer', () => {
  it('shows the quote, what it is for, what it costs and until when', async () => {
    await home(fullHome)
    const quote = section('Needs your answer')
    expect(quote.getByText('Front discs and pads')).toBeInTheDocument()
    expect(quote.getByText('4 850 kr')).toBeInTheDocument()
    expect(quote.getByText('Quote Q-2041')).toBeInTheDocument()
    expect(quote.getByText('Volvo V60 · Valid until 29 Nov')).toBeInTheDocument()
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
    expect(pay.getByText('Invoice 1042 · 9 Nov')).toBeInTheDocument()
    expect(pay.getByText('Toyota RAV4 · Due 28 Nov')).toBeInTheDocument()
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

  it('says overdue and what is left after a part payment, for a single invoice', async () => {
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
    expect(pay.getByText('Overdue since 10 Nov')).toBeInTheDocument()
    expect(pay.queryByText(/Due 10 Nov/)).not.toBeInTheDocument()
    expect(pay.getByText('3 280 kr')).toBeInTheDocument()
    expect(pay.getByText(/1 000 kr of 4 280 kr paid/)).toBeInTheDocument()
    expect(pay.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('leads with the sum of several invoices, then the most urgent one, then all of them', async () => {
    const invoice = fullHome.toPay[0]
    await home({
      ...fullHome,
      toPay: [
        { ...invoice, overdue: true, dueAt: '2026-11-10T11:00:00Z', paid: 1000, balance: 3280 },
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
    expect(pay.getByText('Most urgent')).toBeInTheDocument()
    expect(pay.getByText('EU inspection and service')).toBeInTheDocument()
    expect(pay.getByText('3 280 kr')).toBeInTheDocument()
    expect(pay.getByText('Overdue since 10 Nov')).toBeInTheDocument()
    expect(
      pay.getByText(/Invoice 1042 · Toyota RAV4 · 1 000 kr of 4 280 kr paid/)
    ).toBeInTheDocument()
    expect(pay.getAllByRole('link', { name: 'Pay now' })).toHaveLength(1)
    expect(pay.getByRole('link', { name: 'See the invoice' })).toHaveAttribute(
      'href',
      '/portal/fjordside/invoices/i1'
    )
    expect(pay.getByRole('link', { name: 'See all 11 invoices' })).toHaveAttribute(
      'href',
      '/portal/fjordside/invoices'
    )
  })

  it('calls the first of several the next to pay when none is overdue', async () => {
    const invoice = fullHome.toPay[0]
    await home({
      ...fullHome,
      toPay: [invoice, { ...invoice, id: 'i2', balance: 500 }],
      toPayTotal: 4780,
      toPayCount: 2,
    })
    const pay = section('To pay')
    expect(pay.getByText('4 780 kr')).toBeInTheDocument()
    expect(pay.getByText('Next to pay')).toBeInTheDocument()
    expect(pay.getByText(/Due 28 Nov/)).toBeInTheDocument()
    expect(pay.queryByText(/overdue/i)).not.toBeInTheDocument()
  })

  it('stands alone when there is no quote to answer', async () => {
    await home({ ...fullHome, toAnswer: [] })
    expect(screen.queryByText('Needs your answer')).not.toBeInTheDocument()
    expect(section('To pay').getByText('4 280 kr')).toBeInTheDocument()
  })
})

describe('the chat', () => {
  it('is on the board, in a column that says what it is', async () => {
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

  it('is nowhere on the board when the workshop turned it off', async () => {
    await home({ ...fullHome, messages: { enabled: false, unread: 0, latest: [] } }, null)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /messages/i })).not.toBeInTheDocument()
  })
})

describe('tyres stored with the workshop', () => {
  it('show the season, since when, and a spec sheet of the set', async () => {
    await home(fullHome)
    const tires = section('Tyre hotel')
    expect(tires.getByText('Summer tyres stored with us')).toBeInTheDocument()
    expect(tires.getByText('stored since 21 Oct')).toBeInTheDocument()
    expect(spec(tires, 'Car')).toHaveTextContent('Toyota RAV4')
    expect(spec(tires, 'Tyres')).toHaveTextContent('Michelin Primacy 4')
    expect(spec(tires, 'Size')).toHaveTextContent('225/60 R18')
    expect(spec(tires, 'Set')).toHaveTextContent('4 tyres')
    expect(spec(tires, 'Tread left')).toHaveTextContent('5 mm')
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
        { ...summerSet, treadDepthMm: null, brand: null, model: null, vehicle: null },
        { ...summerSet, id: 't2', season: 'winter', studded: true, treadDepthMm: 6.5 },
      ],
    })
    const tires = section('Tyre hotel')
    expect(spec(tires, 'Tread left')).toHaveTextContent('Tread not measured yet')
    expect(tires.queryByText('Car', { selector: 'dt' })).not.toBeInTheDocument()
    expect(tires.queryByText('Tyres', { selector: 'dt' })).not.toBeInTheDocument()
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
    expect(volvo).toHaveTextContent('EK 12345')
    expect(volvo).toHaveTextContent('8 visits')
    expect(volvo).toHaveTextContent('In the workshop')
    const toyota = cars.getByRole('link', { name: /Toyota RAV4/ })
    expect(toyota).toHaveTextContent('EL 54321')
    expect(toyota).toHaveTextContent('3 visits')
    expect(toyota).toHaveTextContent('warranty active')
    expect(toyota).not.toHaveTextContent('In the workshop')
  })

  it('says when, which car and what for, and how to get there', async () => {
    await home(fullHome)
    const visit = section('Next visit')
    expect(visit.getByText('Thursday 3 December')).toBeInTheDocument()
    expect(visit.getByText('08:00')).toBeInTheDocument()
    expect(visit.getByText('Toyota RAV4')).toBeInTheDocument()
    expect(visit.getByText('EU inspection follow-up')).toBeInTheDocument()
    expect(visit.getByText('Strandgaten 14, Bergen')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
  })

  it('says no visit is booked, with a way to book one, while a car is in', async () => {
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
  it('is led by the next visit when one is booked, said once', async () => {
    await home({ ...fullHome, jobs: [] })
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Next visit')
    expect(heading).toHaveTextContent('Thursday 3 December')
    expect(heading).toHaveTextContent('08:00')
    expect(screen.getByText('Hi Kari. Nothing in the workshop right now.')).toBeInTheDocument()
    expect(screen.getByText('EU inspection follow-up')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Directions' })).toBeInTheDocument()
    expect(screen.getAllByText('08:00')).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'How far the work has come' })).toBeNull()
  })

  it('is greeted, told nothing is in the workshop, and offered a visit', async () => {
    await home(emptyHome)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hi Kari. Nothing in the workshop right now.' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Book a visit when your car needs us. You follow the work here, step by step.'
      )
    ).toBeInTheDocument()
    const book = screen.getAllByRole('link', { name: 'Book a visit' })
    expect(book).toHaveLength(1)
    expect(book[0]).toHaveAttribute('href', '/portal/fjordside/request-service')
  })

  it('shows no empty cells for quotes, invoices, tyres or a visit', async () => {
    await home(emptyHome)
    expect(screen.queryByText('Needs your answer')).not.toBeInTheDocument()
    expect(screen.queryByText('To pay')).not.toBeInTheDocument()
    expect(screen.queryByText('Tyre hotel')).not.toBeInTheDocument()
    expect(screen.queryByText('Next visit')).not.toBeInTheDocument()
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
    expect(sent.getByText('Sent 12 Nov · Waiting for an answer')).toBeInTheDocument()
  })
})

describe("Garage's frame", () => {
  function chrome(over: Partial<PortalChromeProps> = {}) {
    return render(
      <Chrome
        orgParam="fjordside"
        workshop={workshop}
        customerName="Kari Nordmann"
        marine={false}
        messagesEnabled
        unreadMessages={0}
        {...over}
      >
        <p>Page body</p>
      </Chrome>
    )
  }
  /** The phone's tabs are the second of the two navigations, after the bar's. */
  const tabs = () => within(screen.getAllByRole('navigation', { name: 'Main' })[1])
  const bar = () => within(screen.getAllByRole('navigation', { name: 'Main' })[0])

  it('offers Home, Messages, Book, My cars and Papers along the bottom of a phone', () => {
    chrome()
    expect(
      tabs()
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')])
    ).toEqual([
      ['Home', '/portal/fjordside/dashboard'],
      ['Messages', '/portal/fjordside/messages'],
      ['Book', '/portal/fjordside/request-service'],
      ['My cars', '/portal/fjordside/vehicles'],
      ['Papers', '/portal/fjordside/documents'],
    ])
    expect(tabs().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'Book' })).not.toHaveAttribute('aria-current')
  })

  it('counts unread messages on Messages, in words too, on the phone and on the desk', () => {
    chrome({ unreadMessages: 3 })
    for (const where of [tabs(), bar()]) {
      const messages = where.getByRole('link', { name: /Messages/ })
      expect(messages).toHaveTextContent('3')
      expect(messages).toHaveAccessibleName(/3 unread messages/)
    }
  })

  it('leaves Messages out everywhere when the workshop turned the chat off', () => {
    chrome({ messagesEnabled: false })
    expect(
      tabs()
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Home', 'Book', 'My cars', 'Papers'])
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument()
  })

  it('names the places in full on the desk bar and marks the one being shown', () => {
    nav.pathname = '/portal/fjordside/quotes/q1'
    chrome({ marine: true })
    expect(
      bar()
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Home', 'Messages', 'My boats', 'Invoices and quotes'])
    expect(bar().getByRole('link', { name: 'Invoices and quotes' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
  })

  it('keeps the workshop, its hours, the page and the way out on screen', async () => {
    const user = userEvent.setup()
    chrome({
      workshop: { ...workshop, name: 'Fjordside Auto og Båtservice Bergen Sentrum AS' },
    })
    expect(
      screen.getByRole('link', { name: 'Fjordside Auto og Båtservice Bergen Sentrum AS, home' })
    ).toHaveAttribute('href', '/portal/fjordside/dashboard')
    expect(screen.getAllByText('Open until 17:00').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('main')).getByText('Page body')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#portal-main'
    )
    await user.click(screen.getByRole('button', { name: 'Your account, Kari Nordmann' }))
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('offers no choice of theme or view to the customer', () => {
    chrome()
    expect(screen.queryByText(/theme|view|layout/i)).not.toBeInTheDocument()
  })
})

describe("Garage's front door", () => {
  /** Mon to Fri 07:30 to 17:00, Saturday 09:00 to 13:00, Sunday closed. Sunday first. */
  const week = [
    { open: false, start: '09:00', end: '13:00' },
    ...Array.from({ length: 5 }, () => ({ open: true, start: '07:30', end: '17:00' })),
    { open: true, start: '09:00', end: '13:00' },
  ]
  // A Saturday.
  const hours = { week, today: '2026-11-14', timeFormat: '24h' as const, closedSoon: [] }

  const door = async (over: Partial<PortalSignInProps> = {}) =>
    render(
      await SignIn({
        orgParam: 'fjordside',
        workshop: { ...workshop, hours },
        description: 'Family-run workshop in Bergen since 1998.',
        hoursText: null,
        coverUrl: null,
        eyebrow: 'For our customers',
        heading: 'See your car, your invoices and your messages.',
        children: <p>The form</p>,
        ...over,
      })
    )

  it('names the workshop first, then says what signing in gives, above the form', async () => {
    await door()
    expect(screen.getByRole('heading', { level: 1, name: 'Fjordside Auto' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    expect(
      main.getByRole('heading', {
        level: 2,
        name: 'See your car, your invoices and your messages.',
      })
    ).toBeInTheDocument()
    expect(main.getByText('For our customers')).toBeInTheDocument()
    expect(main.getByText('The form')).toBeInTheDocument()
  })

  it("carries the workshop's own words, whether it is open, and until when as a numeral", async () => {
    await door()
    expect(screen.getByText('Family-run workshop in Bergen since 1998.')).toBeInTheDocument()
    expect(screen.getByText('Open until 17:00')).toBeInTheDocument()
    const foot = within(screen.getByRole('contentinfo'))
    expect(foot.getByText('Open today until')).toBeInTheDocument()
    expect(foot.getByText('17:00')).toBeInTheDocument()
  })

  it('says when it opens, on the clock the workshop keeps, while it is shut', async () => {
    await door({
      workshop: {
        ...workshop,
        hours: { ...hours, timeFormat: '12h' },
        openNow: false,
        closesAt: null,
        opensAt: '07:30',
        openLine: 'Opens at 7:30 AM',
      },
    })
    const foot = within(screen.getByRole('contentinfo'))
    expect(foot.getByText('Opens today at')).toBeInTheDocument()
    expect(foot.getByText('7:30 AM')).toBeInTheDocument()
  })

  it('puts signing in before how to find and reach the workshop', async () => {
    await door()
    const form = screen.getByText('The form')
    const findUs = screen.getByText('Find us')
    expect(form.compareDocumentPosition(findUs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the week in as few lines as it takes, with today marked', async () => {
    await door()
    const foot = within(screen.getByRole('contentinfo'))
    const row = (days: string) => foot.getByText(days, { selector: 'dt' }).parentElement
    expect(row('Mon to Fri')).toHaveTextContent('07:30 to 17:00')
    expect(row('Saturday')).toHaveTextContent('09:00 to 13:00')
    expect(row('Sunday')).toHaveTextContent('closed')
    expect(row('Saturday')).toHaveAttribute('aria-current', 'date')
    expect(row('Mon to Fri')).not.toHaveAttribute('aria-current')
  })

  it("shows the workshop's typed hours when there is no calendar week", async () => {
    await door({ workshop: { ...workshop, hours: null }, hoursText: 'Weekdays 7 to 4' })
    expect(screen.getByText('Weekdays 7 to 4')).toBeInTheDocument()
    expect(screen.queryByText(/Mon to Fri/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Open until 17:00').length).toBeGreaterThan(0)
  })

  it('links the address to directions and the phone to a call', async () => {
    await door()
    expect(screen.getByText('Strandgaten 14, Bergen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
    expect(screen.getByRole('link', { name: '55 00 00 00' })).toHaveAttribute(
      'href',
      'tel:55000000'
    )
  })

  it('shows the cover photo when the workshop uploaded one, and its own frame when not', async () => {
    const { container, unmount } = await door()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Family-run workshop in Bergen since 1998.')).toBeInTheDocument()
    unmount()
    const withCover = await door({ coverUrl: '/api/public/portal-bg/org1?v=a.jpg' })
    expect(withCover.container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/public/portal-bg/org1?v=a.jpg'
    )
  })

  it('still stands when the workshop has told nothing about itself', async () => {
    await door({
      workshop: {
        ...workshop,
        hours: null,
        phone: null,
        phoneHref: null,
        address: null,
        directionsUrl: null,
      },
      description: null,
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Fjordside Auto' })).toBeInTheDocument()
    expect(screen.getByText('The form')).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.queryByText('Find us')).not.toBeInTheDocument()
  })
})
