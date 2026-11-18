/**
 * The portal's frame, as Daylight draws it: the five places to go with the
 * current one marked, unread messages on the Messages tab, the workshop's
 * name and today's hours always on screen, and the customer's way out.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workshop } from './helpers/fixtures'

const nav = vi.hoisted(() => ({ pathname: '/portal/fjordside/dashboard' }))
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/lib/db', () => ({ db: { customer: { findUnique: vi.fn() } } }))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: vi.fn(async () => ({ customerId: 'c1', organizationId: 'org1' })),
}))
vi.mock('@/lib/portal-slug', () => ({
  resolvePortalOrg: vi.fn(async () => ({ id: 'org1', name: 'Fjordside Auto' })),
}))
vi.mock('@/features/portal/Lib/portalLive', () => ({ isPortalLive: vi.fn(async () => true) }))
vi.mock('@/features/portal/Lib/portalLook.server', () => ({ loadPortalLook: vi.fn() }))
vi.mock('@/features/portal/Lib/workshop.server', () => ({ loadPortalWorkshop: vi.fn() }))
vi.mock('@/features/portal/Lib/chat.server', () => ({ countPortalUnread: vi.fn(async () => 2) }))

import { PortalDocumentsTabs } from '@/features/portal/Components/PortalDocumentsTabs'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { Chrome } from '@/features/portal/Components/Themes/Daylight/Chrome'
import type { PortalChromeProps } from '@/features/portal/Components/Themes/types'
import { countPortalUnread } from '@/features/portal/Lib/chat.server'
import { isPortalLive } from '@/features/portal/Lib/portalLive'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { DEFAULT_PORTAL_LOOK } from '@/features/portal/Lib/theme'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'

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
const tabBar = () => screen.getAllByRole('navigation', { name: 'Main' })[1]
const deskBar = () => screen.getAllByRole('navigation', { name: 'Main' })[0]

describe('the phone tab bar', () => {
  beforeEach(() => {
    nav.pathname = '/portal/fjordside/dashboard'
  })

  it('offers Home, Messages, Book, My cars and Papers, each going where it says', () => {
    chrome()
    const links = within(tabBar()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home', '/portal/fjordside/dashboard'],
      ['Messages', '/portal/fjordside/messages'],
      ['Book', '/portal/fjordside/request-service'],
      ['My cars', '/portal/fjordside/vehicles'],
      ['Papers', '/portal/fjordside/documents'],
    ])
  })

  it('marks Home on the home page and nothing else', () => {
    chrome()
    const bar = within(tabBar())
    expect(bar.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(bar.getByRole('link', { name: 'Book' })).not.toHaveAttribute('aria-current')
  })

  it.each([
    '/portal/fjordside/invoices',
    '/portal/fjordside/invoices/inv1',
    '/portal/fjordside/quotes',
    '/portal/fjordside/inspections',
    '/portal/fjordside/documents',
  ])('marks Papers on %s', (pathname) => {
    nav.pathname = pathname
    chrome()
    const bar = within(tabBar())
    expect(bar.getByRole('link', { name: 'Papers' })).toHaveAttribute('aria-current', 'page')
    expect(bar.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('marks My cars on a car page and Messages on the chat', () => {
    nav.pathname = '/portal/fjordside/vehicles/v1'
    const { unmount } = chrome()
    expect(within(tabBar()).getByRole('link', { name: 'My cars' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    unmount()
    nav.pathname = '/portal/fjordside/messages'
    chrome()
    expect(within(tabBar()).getByRole('link', { name: /Messages/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('shows how many messages are unread on the Messages tab, in words too', () => {
    chrome({ unreadMessages: 3 })
    const messages = within(tabBar()).getByRole('link', { name: /Messages/ })
    expect(messages).toHaveTextContent('3')
    expect(messages).toHaveAccessibleName(/3 unread messages/)
  })

  it('shows no badge when everything is read', () => {
    chrome({ unreadMessages: 0 })
    expect(within(tabBar()).getByRole('link', { name: 'Messages' })).toHaveTextContent(/^Messages$/)
  })

  it('leaves Messages out when the workshop turned the chat off', () => {
    chrome({ messagesEnabled: false })
    const links = within(tabBar()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'Book', 'My cars', 'Papers'])
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument()
  })

  it('says boats for a marine workshop', () => {
    chrome({ marine: true })
    expect(within(tabBar()).getByRole('link', { name: 'My boats' })).toBeInTheDocument()
  })
})

describe('the top bar', () => {
  beforeEach(() => {
    nav.pathname = '/portal/fjordside/quotes'
  })

  it('shows the workshop name, linking home, and whether it is open', () => {
    chrome()
    expect(screen.getByRole('link', { name: 'Fjordside Auto, home' })).toHaveAttribute(
      'href',
      '/portal/fjordside/dashboard'
    )
    expect(screen.getAllByText('Open until 17:00').length).toBeGreaterThan(0)
  })

  it('names the places in full on a desk, with the open one marked', () => {
    chrome()
    const links = within(deskBar()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'My cars', 'Invoices and quotes'])
    expect(within(deskBar()).getByRole('link', { name: 'Invoices and quotes' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('has Book a visit as its one button', () => {
    chrome()
    expect(screen.getByRole('link', { name: 'Book a visit' })).toHaveAttribute(
      'href',
      '/portal/fjordside/request-service'
    )
  })

  it('offers no way to change how the portal looks', () => {
    chrome()
    expect(screen.queryByText(/Overview|Timeline|Headline|theme/i)).not.toBeInTheDocument()
  })

  it("shows the customer's initials on a labelled account button", () => {
    chrome()
    expect(screen.getByRole('button', { name: 'Your account, Kari Nordmann' })).toHaveTextContent(
      'KN'
    )
  })

  it('opens a menu with their name and Sign out, and closes it on Escape', async () => {
    const user = userEvent.setup()
    chrome()
    const account = screen.getByRole('button', { name: /Your account/ })
    await user.click(account)
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Kari Nordmann')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(account).toHaveFocus()
  })

  it('signs the customer out and takes them to the sign-in page', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    chrome()
    await user.click(screen.getByRole('button', { name: /Your account/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(fetchMock).toHaveBeenCalledWith('/portal/fjordside/auth/logout', {
      method: 'POST',
    })
    expect(router.push).toHaveBeenCalledWith('/portal/fjordside/auth/login')
    vi.unstubAllGlobals()
  })
})

describe('the foot of the page', () => {
  beforeEach(() => {
    nav.pathname = '/portal/fjordside/vehicles'
  })

  it("has the workshop's phone and address, each a link", () => {
    chrome()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'Call 55 00 00 00' })).toHaveAttribute(
      'href',
      'tel:55000000'
    )
    expect(
      within(footer).getByRole('link', { name: 'Open Strandgaten 14, Bergen in maps' })
    ).toHaveAttribute('href', expect.stringContaining('Strandgaten%2014'))
  })

  it('is left out when the workshop has set neither, and under the chat', () => {
    const { unmount } = chrome({
      workshop: { ...workshop, phone: null, phoneHref: null, address: null, directionsUrl: null },
    })
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    unmount()
    nav.pathname = '/portal/fjordside/messages'
    chrome()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })
})

describe('the shell', () => {
  beforeEach(() => {
    nav.pathname = '/portal/fjordside/dashboard'
    vi.mocked(db.customer.findUnique).mockResolvedValue({ name: 'Kari Nordmann' } as never)
    vi.mocked(loadPortalLook).mockResolvedValue(DEFAULT_PORTAL_LOOK)
    vi.mocked(loadPortalWorkshop).mockResolvedValue({ ...workshop, marine: false })
    vi.mocked(isPortalLive).mockResolvedValue(true)
    vi.mocked(getCustomerSession).mockResolvedValue({ customerId: 'c1', organizationId: 'org1' })
    vi.mocked(countPortalUnread).mockResolvedValue(2)
  })

  const shell = async (props: { bare?: boolean } = {}) =>
    render(await PortalShell({ orgId: 'fjordside', ...props, children: <p>Page body</p> }))

  it('draws the page inside the frame, with the unread count it read for this customer', async () => {
    await shell()
    expect(screen.getByText('Page body')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your account, Kari Nordmann' })).toBeInTheDocument()
    expect(within(tabBar()).getByRole('link', { name: /Messages/ })).toHaveAccessibleName(
      /2 unread messages/
    )
    expect(countPortalUnread).toHaveBeenCalledWith('org1', 'c1')
  })

  it('gives an ordinary page the page box, and a bare page the whole width', async () => {
    const { unmount } = await shell()
    expect(screen.getByText('Page body').parentElement).toHaveClass('p-page')
    unmount()
    await shell({ bare: true })
    expect(screen.getByText('Page body').parentElement).not.toHaveClass('p-page')
  })

  it('does not count messages for a workshop that turned the chat off', async () => {
    vi.mocked(countPortalUnread).mockClear()
    vi.mocked(loadPortalLook).mockResolvedValue({ ...DEFAULT_PORTAL_LOOK, messagesEnabled: false })
    await shell()
    expect(countPortalUnread).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument()
  })

  it('still draws the page when the unread count cannot be read', async () => {
    vi.mocked(countPortalUnread).mockRejectedValue(new Error('db down'))
    await shell()
    expect(screen.getByText('Page body')).toBeInTheDocument()
  })

  it('sends someone who is not signed in to this workshop to the sign-in page', async () => {
    vi.mocked(getCustomerSession).mockResolvedValue(null)
    await expect(shell()).rejects.toThrow('redirect:/portal/fjordside/auth/login')
    vi.mocked(getCustomerSession).mockResolvedValue({ customerId: 'c9', organizationId: 'other' })
    await expect(shell()).rejects.toThrow('redirect:/portal/fjordside/auth/login')
  })

  it('says so, and shows no page, when the workshop has not opened its portal', async () => {
    vi.mocked(isPortalLive).mockResolvedValue(false)
    await shell()
    expect(screen.getByRole('heading', { name: 'Not available' })).toBeInTheDocument()
    expect(screen.queryByText('Page body')).not.toBeInTheDocument()
  })
})

describe('the document tabs', () => {
  it('links the three lists and marks the open one', async () => {
    render(await PortalDocumentsTabs({ orgId: 'fjordside', active: 'quotes' }))
    const tabs = within(screen.getByRole('navigation', { name: 'Documents' })).getAllByRole('link')
    expect(tabs.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Invoices', '/portal/fjordside/invoices'],
      ['Quotes', '/portal/fjordside/quotes'],
      ['Inspections', '/portal/fjordside/inspections'],
    ])
    expect(screen.getByRole('link', { name: 'Quotes' })).toHaveAttribute('aria-current', 'page')
  })
})
