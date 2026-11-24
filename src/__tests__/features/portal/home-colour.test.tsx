/**
 * The portal as the Colour theme draws it: the car in the workshop on the
 * workshop's own colour with its three steps, what waits on the customer,
 * the chat always there on a desk, stored tyres only for a workshop that
 * stores them, the next visit on the colour when no car is in, and a page
 * that still looks finished when there is nothing to show. Then its frame
 * (the places to go, unread messages) and its front door.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyHome, format, fullHome, workshop } from './helpers/fixtures'

const nav = vi.hoisted(() => ({ pathname: '/portal/fjordside/dashboard' }))
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => router }))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/features/portal/Actions/respondToPortalQuote', () => ({
  respondToPortalQuote: vi.fn(async () => ({ success: true, data: { status: 'accepted' } })),
}))
// The badge's number is the chat's to keep live; here it is what the server counted.
vi.mock('@/features/portal/Components/Chat/usePortalUnread', () => ({
  usePortalUnread: (_org: string, initial: number) => initial,
}))

import { respondToPortalQuote } from '@/features/portal/Actions/respondToPortalQuote'
import { Chrome } from '@/features/portal/Components/Themes/Colour/Chrome'
import { Home } from '@/features/portal/Components/Themes/Colour/Home'
import { SignIn } from '@/features/portal/Components/Themes/Colour/SignIn'
import type {
  PortalChromeProps,
  PortalSignInProps,
} from '@/features/portal/Components/Themes/types'
import type { PortalHomeData } from '@/features/portal/Lib/homeTypes'

const home = async (data: PortalHomeData, chat: React.ReactNode = <p>The chat</p>) =>
  render(await Home({ orgParam: 'fjordside', data, format, chat }))

const [summerSet] = fullHome.tires as NonNullable<PortalHomeData['tires']>
const nextVisit = fullHome.nextVisit as NonNullable<PortalHomeData['nextVisit']>

const section = (name: string) => within(screen.getByRole('region', { name }))
const stepOf = (list: HTMLElement, label: string) =>
  within(list).getByText(label).closest('li') as HTMLElement

beforeEach(() => {
  nav.pathname = '/portal/fjordside/dashboard'
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
    const steps = screen.getByRole('list', { name: 'How far the work has come' })
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    expect(stepOf(steps, 'Checked in')).not.toHaveAttribute('aria-current')
    expect(stepOf(steps, 'In the workshop')).toHaveAttribute('aria-current', 'step')
    expect(stepOf(steps, 'In the workshop')).toHaveTextContent('In the workshop Now')
    expect(stepOf(steps, 'Ready to collect')).not.toHaveAttribute('aria-current')
  })

  it('carries the latest update with a way to see it', async () => {
    await home(fullHome)
    const update = section('Latest from the workshop · 10:12')
    expect(update.getByText(/Front discs are worn past the limit/)).toBeInTheDocument()
    expect(update.getByRole('link', { name: 'See photos and video' })).toHaveAttribute(
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
    const steps = screen.getByRole('list', { name: 'How far the work has come' })
    expect(stepOf(steps, 'Booked')).toHaveAttribute('aria-current', 'step')
    // Booked is not happening now, and nothing has been shared yet.
    expect(screen.queryByText('Now')).not.toBeInTheDocument()
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

  it('keeps a long job title and a car without a plate in full', async () => {
    const title =
      'Timing belt, water pump, both front lower control arms and a full four-wheel alignment'
    await home({
      ...fullHome,
      jobs: [
        {
          ...fullHome.jobs[0],
          title,
          vehicle: { id: 'x', label: 'Volvo V60', licensePlate: null },
        },
      ],
    })
    const hero = section('Hi Kari. Your car is in the workshop, ready today around 16:00.')
    expect(hero.getByText(title)).toBeInTheDocument()
    expect(hero.queryByText('EK 12345')).not.toBeInTheDocument()
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
      toPayCount: 1,
      toPayOverdueCount: 1,
    })
    const pay = section('To pay')
    expect(pay.getByText('Overdue since 10/11/2026')).toBeInTheDocument()
    expect(pay.queryByText(/^Due /)).not.toBeInTheDocument()
    expect(pay.getByText('3 280 kr')).toBeInTheDocument()
    expect(pay.getByText('1 000 kr of 4 280 kr paid')).toBeInTheDocument()
    expect(pay.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('leads with the sum of them all when there are several, then the most urgent one', async () => {
    await home({
      ...fullHome,
      toPay: [
        { ...fullHome.toPay[0], overdue: true, dueAt: '2026-11-10T11:00:00Z' },
        { ...fullHome.toPay[0], id: 'i2', title: 'Tyre change', balance: 500 },
      ],
      toPayTotal: 20124,
      toPayCount: 11,
      toPayOverdueCount: 3,
    })
    const pay = section('To pay')
    expect(pay.getByText('20 124 kr')).toBeInTheDocument()
    expect(pay.getByText('11 invoices')).toBeInTheDocument()
    expect(pay.getByText('3 overdue')).toBeInTheDocument()
    expect(pay.getByText('Most urgent')).toBeInTheDocument()
    expect(pay.getByText('EU inspection and service')).toBeInTheDocument()
    expect(pay.getByText('4 280 kr')).toBeInTheDocument()
    expect(pay.getByText('Overdue since 10/11/2026')).toBeInTheDocument()
    expect(pay.queryByText('Tyre change')).not.toBeInTheDocument()
    expect(pay.getByRole('link', { name: 'Pay now' })).toHaveAttribute(
      'href',
      '/share/invoice/fjordside/tok-i1'
    )
    expect(pay.getByRole('link', { name: 'See all 11 invoices' })).toHaveAttribute(
      'href',
      '/portal/fjordside/invoices'
    )
  })

  it('calls the first of several the next to pay when none is overdue', async () => {
    await home({
      ...fullHome,
      toPay: [fullHome.toPay[0], { ...fullHome.toPay[0], id: 'i2' }],
      toPayTotal: 8560,
      toPayCount: 2,
      toPayOverdueCount: 0,
    })
    const pay = section('To pay')
    expect(pay.getByText('8 560 kr')).toBeInTheDocument()
    expect(pay.getByText('2 invoices')).toBeInTheDocument()
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
    expect(tires.getByText('Toyota RAV4')).toBeInTheDocument()
    expect(tires.getByText('Michelin Primacy 4 · 225/60 R18')).toBeInTheDocument()
    expect(
      within(tires.getByText('tread left').closest('div') as HTMLElement).getByText('5 mm')
    ).toBeInTheDocument()
    expect(
      within(tires.getByText('Stored since').closest('div') as HTMLElement).getByText('21/10/2026')
    ).toBeInTheDocument()
  })

  it('are not mentioned when the workshop runs no tyre hotel', async () => {
    await home({ ...fullHome, tires: null })
    expect(screen.queryByText(/tyre/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/tread/i)).not.toBeInTheDocument()
  })

  it('are not mentioned when the tyre hotel is on and nothing is stored', async () => {
    await home({ ...fullHome, tires: [] })
    expect(screen.queryByText(/tyre/i)).not.toBeInTheDocument()
  })

  it('say so when the tread was never measured, and list a second set', async () => {
    await home({
      ...fullHome,
      tires: [
        { ...summerSet, treadDepthMm: null, storedSince: null },
        { ...summerSet, id: 't2', season: 'winter', studded: true, treadDepthMm: 6.5 },
      ],
    })
    const tires = section('Tyre hotel')
    expect(tires.getByText('Tread not measured yet')).toBeInTheDocument()
    expect(tires.queryByText('Stored since')).not.toBeInTheDocument()
    expect(tires.getByText('Winter tyres')).toBeInTheDocument()
    expect(
      tires.getByText(/studded · stored since 21\/10\/2026 · 6.5 mm tread left/)
    ).toBeInTheDocument()
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
    expect(visit.getByText('Thursday 3 December')).toBeInTheDocument()
    expect(visit.getByText('08:00 · Toyota RAV4')).toBeInTheDocument()
    expect(visit.getByText('EU inspection follow-up')).toBeInTheDocument()
    expect(visit.getByText('Strandgaten 14, Bergen')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
  })
})

describe('a customer with no car in the workshop', () => {
  it('is shown the next visit where the car would be, once and not twice', async () => {
    await home({ ...emptyHome, cars: fullHome.cars, nextVisit })
    const hero = section('Hi Kari. Nothing in the workshop right now.')
    const visit = within(hero.getByRole('region', { name: 'Next visit' }))
    expect(visit.getByText('Thursday 3 December, 08:00')).toBeInTheDocument()
    expect(visit.getByText('Toyota RAV4 · EU inspection follow-up')).toBeInTheDocument()
    expect(visit.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
    expect(screen.getAllByRole('region', { name: 'Next visit' })).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'How far the work has come' })).toBeNull()
    expect(screen.queryByText(/Book a visit when your car needs us/)).not.toBeInTheDocument()
  })

  it('is greeted, told nothing is in the workshop, and offered a visit', async () => {
    await home(emptyHome)
    const hero = section('Hi Kari. Nothing in the workshop right now.')
    expect(hero.getByText(/Book a visit when your car needs us/)).toBeInTheDocument()
    expect(hero.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
  })

  it('shows no empty boxes for an update, quotes, invoices or tyres', async () => {
    await home(emptyHome)
    expect(screen.queryByText(/Latest from the workshop/)).not.toBeInTheDocument()
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

  it('offers no way to change how the portal looks', async () => {
    await home(fullHome)
    expect(screen.queryByText(/Overview|Timeline|Headline|theme/i)).not.toBeInTheDocument()
  })
})

describe("Colour's frame", () => {
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
  /** The phone's tab bar is the second of the two navigations, after the desk bar's. */
  const tabBar = () => within(screen.getAllByRole('navigation', { name: 'Main' })[1])
  const deskBar = () => within(screen.getAllByRole('navigation', { name: 'Main' })[0])

  it('draws the page, with a way to skip to it', () => {
    chrome()
    expect(within(screen.getByRole('main')).getByText('Page body')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#portal-main'
    )
  })

  it('offers Home, Messages, Book, My cars and Papers on a phone, each going where it says', () => {
    chrome()
    const links = tabBar().getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual([
      'Home',
      'Messages',
      'Book',
      'My cars',
      'Papers',
    ])
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/portal/fjordside/dashboard',
      '/portal/fjordside/messages',
      '/portal/fjordside/request-service',
      '/portal/fjordside/vehicles',
      '/portal/fjordside/documents',
    ])
    expect(tabBar().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(tabBar().getByRole('link', { name: 'My cars' })).not.toHaveAttribute('aria-current')
  })

  it('shows how many messages are unread, in words too, and nothing when all are read', () => {
    const { unmount } = chrome({ unreadMessages: 2 })
    expect(tabBar().getByRole('link', { name: /Messages/ })).toHaveTextContent('2 unread messages')
    unmount()
    chrome()
    expect(screen.queryByText(/unread/)).not.toBeInTheDocument()
  })

  it('leaves Messages out when the workshop turned the chat off, and says boats for a marina', () => {
    chrome({ messagesEnabled: false, marine: true })
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument()
    expect(tabBar().getByRole('link', { name: 'My boats' })).toBeInTheDocument()
  })

  it('names the workshop, linking home, whether it is open, and the places in full on a desk', () => {
    nav.pathname = '/portal/fjordside/quotes/q1'
    chrome()
    expect(screen.getByRole('link', { name: 'Fjordside Auto, home' })).toHaveAttribute(
      'href',
      '/portal/fjordside/dashboard'
    )
    expect(screen.getAllByText('Open until 17:00').length).toBeGreaterThan(0)
    expect(
      deskBar()
        .getAllByRole('link')
        .map((a) => a.textContent)
    ).toEqual(['Home', 'My cars', 'Invoices and quotes'])
    expect(deskBar().getByRole('link', { name: 'Invoices and quotes' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
  })

  it("has the customer's way out, and no way to change how the portal looks", async () => {
    const user = userEvent.setup()
    chrome()
    const account = screen.getByRole('button', { name: 'Your account, Kari Nordmann' })
    expect(account).toHaveTextContent('KN')
    await user.click(account)
    expect(
      within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Sign out' })
    ).toBeVisible()
    expect(screen.queryByText(/Overview|Timeline|Headline|theme/i)).not.toBeInTheDocument()
  })

  it("has the workshop's phone and address at the foot, but not under the chat", () => {
    const { unmount } = chrome()
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'Call 55 00 00 00' })).toHaveAttribute(
      'href',
      'tel:55000000'
    )
    expect(
      footer.getByRole('link', { name: 'Open Strandgaten 14, Bergen in maps' })
    ).toHaveAttribute('href', expect.stringContaining('Strandgaten%2014'))
    unmount()
    nav.pathname = '/portal/fjordside/messages'
    chrome()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })
})

describe("Colour's front door", () => {
  /** Mon to Fri 07:30 to 17:00, Saturday 09:00 to 13:00, Sunday closed. Sunday first. */
  const week = [
    { open: false, start: '09:00', end: '13:00' },
    ...Array.from({ length: 5 }, () => ({ open: true, start: '07:30', end: '17:00' })),
    { open: true, start: '09:00', end: '13:00' },
  ]
  // A Saturday.
  const hours = { week, today: '2026-11-14', timeFormat: '24h' as const, closedSoon: [] }

  const frame = async (over: Partial<PortalSignInProps> = {}) =>
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
    await frame()
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

  it("carries the workshop's own words and whether it is open now", async () => {
    await frame()
    expect(screen.getByText('Family-run workshop in Bergen since 1998.')).toBeInTheDocument()
    expect(screen.getByText('Open until 17:00')).toBeInTheDocument()
  })

  it('puts signing in before how to find and reach the workshop', async () => {
    await frame()
    const form = screen.getByText('The form')
    const findUs = screen.getByText('Find us')
    expect(form.compareDocumentPosition(findUs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the week in as few lines as it takes, with today marked', async () => {
    await frame()
    const lines = section('Opening hours').getAllByRole('listitem')
    expect(lines.map((li) => li.textContent)).toEqual([
      'Mon to Fri 07:30 to 17:00',
      'Saturday 09:00 to 13:00',
      'Sunday closed',
    ])
    expect(lines[1]).toHaveAttribute('aria-current', 'date')
    expect(lines[0]).not.toHaveAttribute('aria-current')
  })

  it("shows the workshop's typed hours when there is no calendar week", async () => {
    await frame({ workshop: { ...workshop, hours: null }, hoursText: 'Weekdays 7 to 4' })
    expect(section('Opening hours').getByText('Weekdays 7 to 4')).toBeInTheDocument()
    expect(screen.queryByText(/Mon to Fri/)).not.toBeInTheDocument()
  })

  it('links the address to directions and the phone to a call', async () => {
    await frame()
    const find = section('Find us')
    expect(find.getByText('Strandgaten 14, Bergen')).toBeInTheDocument()
    expect(find.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
    expect(find.getByRole('link', { name: '55 00 00 00' })).toHaveAttribute('href', 'tel:55000000')
  })

  it('shows the cover photo when the workshop uploaded one, and its initial when not', async () => {
    const { container, unmount } = await frame()
    expect(container.querySelector('img')).toBeNull()
    // The mark beside the name, and the same letter large where the photo would be.
    expect(screen.getAllByText('F')).toHaveLength(2)
    unmount()
    const withCover = await frame({ coverUrl: '/api/public/portal-bg/org1?v=a.jpg' })
    expect(withCover.container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/public/portal-bg/org1?v=a.jpg'
    )
    expect(screen.getAllByText('F')).toHaveLength(1)
  })

  it('still stands when the workshop has told nothing about itself', async () => {
    await frame({
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
    expect(screen.getByText('Open until 17:00')).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.queryByText('Opening hours')).not.toBeInTheDocument()
  })
})
