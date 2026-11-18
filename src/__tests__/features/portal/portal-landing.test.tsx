/**
 * The portal's front page, before anyone signs in: the workshop's own front
 * door, drawn by the theme it chose, with the sign-in in it.
 *
 * The opening hours are the workshop calendar's week, the same the signed-in
 * pages show, once the workshop has set them there. A workshop that only
 * typed its hours gets its own words, not a default week nobody chose.
 */

import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workshop } from './helpers/fixtures'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next-intl/server', async () => (await import('./helpers/serverIntl')).serverIntl)
vi.mock('@/lib/db', () => ({ db: { appSetting: { findFirst: vi.fn() } } }))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/features/workshop-calendar/Lib/loadCalendar.server', () => ({
  loadWorkshopCalendar: vi.fn(),
}))
vi.mock('@/features/portal/Lib/portalLook.server', () => ({ loadPortalLook: vi.fn() }))
vi.mock('@/features/portal/Lib/workshop.server', () => ({ loadPortalWorkshop: vi.fn() }))

import { PortalLanding } from '@/features/portal/Components/PortalLanding'
import { PortalLoginForm } from '@/features/portal/Components/PortalLoginForm'
import { portalWeekLines } from '@/features/portal/Components/SignIn/weekLines'
import { SignIn } from '@/features/portal/Components/Themes/Daylight/SignIn'
import type { PortalSignInProps } from '@/features/portal/Components/Themes/types'
import { loadPortalOpeningHours } from '@/features/portal/Lib/openingHours.server'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { DEFAULT_PORTAL_LOOK } from '@/features/portal/Lib/theme'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { db } from '@/lib/db'
import { englishTranslator } from './helpers/serverIntl'
import { serverTree } from './helpers/serverTree'

/** Mon to Fri 07:30 to 17:00, Saturday 09:00 to 13:00, Sunday closed. Sunday first. */
const week = [
  { open: false, start: '09:00', end: '13:00' },
  ...Array.from({ length: 5 }, () => ({ open: true, start: '07:30', end: '17:00' })),
  { open: true, start: '09:00', end: '13:00' },
]
// A Saturday.
const hours = { week, today: '2026-11-14', timeFormat: '24h' as const, closedSoon: [] }

const frame = (over: Partial<PortalSignInProps> = {}) =>
  SignIn({
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

describe("Daylight's front door", () => {
  it('names the workshop first, then says what signing in gives, above the form', async () => {
    render(await frame())
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
    render(await frame())
    expect(screen.getByText('Family-run workshop in Bergen since 1998.')).toBeInTheDocument()
    expect(screen.getByText('Open until 17:00')).toBeInTheDocument()
  })

  it('puts signing in before how to find and reach the workshop', async () => {
    render(await frame())
    const form = screen.getByText('The form')
    const findUs = screen.getByText('Find us')
    expect(form.compareDocumentPosition(findUs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the week in as few lines as it takes, with today marked', async () => {
    render(await frame())
    const lines = within(screen.getByRole('contentinfo')).getAllByRole('listitem')
    expect(lines.map((li) => li.textContent)).toEqual([
      'Mon to Fri 07:30 to 17:00',
      'Saturday 09:00 to 13:00',
      'Sunday closed',
    ])
    expect(lines[1]).toHaveAttribute('aria-current', 'date')
    expect(lines[0]).not.toHaveAttribute('aria-current')
  })

  it("shows the workshop's typed hours when there is no calendar week", async () => {
    render(await frame({ workshop: { ...workshop, hours: null }, hoursText: 'Weekdays 7 to 4' }))
    expect(screen.getByText('Weekdays 7 to 4')).toBeInTheDocument()
    expect(screen.queryByText(/Mon to Fri/)).not.toBeInTheDocument()
  })

  it('links the address to directions and the phone to a call', async () => {
    render(await frame())
    expect(screen.getByRole('link', { name: 'Directions' })).toHaveAttribute(
      'href',
      expect.stringContaining('Strandgaten%2014')
    )
    expect(screen.getByRole('link', { name: '55 00 00 00' })).toHaveAttribute(
      'href',
      'tel:55000000'
    )
  })

  it('shows the cover photo only when the workshop uploaded one', async () => {
    const { container, unmount } = render(await frame())
    expect(container.querySelector('img')).toBeNull()
    unmount()
    const withCover = render(await frame({ coverUrl: '/api/public/portal-bg/org1?v=a.jpg' }))
    expect(withCover.container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/public/portal-bg/org1?v=a.jpg'
    )
  })

  it('still stands when the workshop has told nothing about itself', async () => {
    render(
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
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Fjordside Auto' })).toBeInTheDocument()
    expect(screen.getByText('The form')).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.queryByText('Opening hours')).not.toBeInTheDocument()
  })
})

describe('the week on the front door', () => {
  const t = englishTranslator('portal.signIn')

  it('is one line when every day is the same', () => {
    const same = Array.from({ length: 7 }, () => ({ open: true, start: '08:00', end: '16:00' }))
    expect(portalWeekLines({ ...hours, week: same }, 'en', t)).toEqual([
      { days: 'Mon to Sun', hours: '08:00 to 16:00', today: true },
    ])
  })

  it('names a day on its own in full, and reads the clock as the workshop set it', () => {
    const lines = portalWeekLines({ ...hours, timeFormat: '12h' }, 'en', t)
    expect(lines.map((line) => `${line.days} ${line.hours}`)).toEqual([
      'Mon to Fri 7:30 AM to 5 PM',
      'Saturday 9 AM to 1 PM',
      'Sunday closed',
    ])
  })

  it('names the days in the language of the page', () => {
    expect(portalWeekLines(hours, 'nb', t)[1].days).toBe('Lørdag')
  })
})

describe('the front page', () => {
  beforeEach(() => {
    vi.mocked(loadPortalLook).mockResolvedValue(DEFAULT_PORTAL_LOOK)
    vi.mocked(loadPortalWorkshop).mockResolvedValue({ ...workshop, marine: false })
    vi.mocked(loadWorkshopCalendar).mockRejectedValue(new Error('no calendar in this test'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  const landing = (over: Partial<Parameters<typeof PortalLanding>[0]> = {}) =>
    serverTree(
      <PortalLanding
        orgParam="fjordside"
        organizationId="org1"
        orgName="Fjordside Auto"
        description={null}
        hoursText={null}
        {...over}
      >
        {over.children ?? (
          <PortalLoginForm
            orgId="fjordside"
            smsEnabled={false}
            defaultCountryCode={null}
            error="That sign-in link has expired."
          />
        )}
      </PortalLanding>
    )

  it("holds the sign-in, in the customer's words, with one field and one button", async () => {
    render(await landing())
    expect(
      screen.getByRole('heading', { name: 'See your car, your invoices and your messages.' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Your email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send me a sign-in link' })).toBeInTheDocument()
    expect(
      screen.getByText('No password. We send you a link that signs you in.')
    ).toBeInTheDocument()
  })

  it('shows a sign-in problem it was given', async () => {
    render(await landing())
    expect(screen.getByRole('alert')).toHaveTextContent('That sign-in link has expired.')
  })

  it('offers no SMS choice when the workshop cannot send texts, and one when it can', async () => {
    const { unmount } = render(await landing())
    expect(screen.queryByRole('button', { name: 'SMS' })).not.toBeInTheDocument()
    unmount()
    render(
      await landing({
        children: <PortalLoginForm orgId="fjordside" smsEnabled defaultCountryCode="+47" />,
      })
    )
    expect(screen.getByRole('button', { name: 'Email' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'SMS' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not promise messages when the workshop turned the chat off, and says boat for a marina', async () => {
    vi.mocked(loadPortalLook).mockResolvedValue({ ...DEFAULT_PORTAL_LOOK, messagesEnabled: false })
    const { unmount } = render(await landing())
    expect(
      screen.getByRole('heading', { name: 'See your car, your invoices and your quotes.' })
    ).toBeInTheDocument()
    unmount()
    vi.mocked(loadPortalLook).mockResolvedValue(DEFAULT_PORTAL_LOOK)
    vi.mocked(loadPortalWorkshop).mockResolvedValue({ ...workshop, marine: true })
    render(await landing())
    expect(
      screen.getByRole('heading', { name: 'See your boat, your invoices and your messages.' })
    ).toBeInTheDocument()
  })

  it("shows the workshop's typed hours when its calendar has none to give", async () => {
    render(await landing({ hoursText: 'Weekdays 7 to 4' }))
    expect(screen.getByText('Weekdays 7 to 4')).toBeInTheDocument()
  })

  it('takes the heading it is given, for the step after the emailed link', async () => {
    render(await landing({ eyebrow: 'Almost there', heading: 'Sign in to Fjordside Auto' }))
    expect(screen.getByRole('heading', { name: 'Sign in to Fjordside Auto' })).toBeInTheDocument()
    expect(screen.getByText('Almost there')).toBeInTheDocument()
  })
})

describe('the hours the front page is given', () => {
  let stored: Record<string, string> = {}

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Monday 16 November in Auckland, still Sunday in UTC.
    vi.setSystemTime(new Date('2026-11-15T20:00:00Z'))
    stored = { 'workshop.timeFormat': '24h' }
    vi.mocked(db.appSetting.findFirst).mockImplementation((async (args: {
      where: { key: string }
    }) => (args.where.key in stored ? { value: stored[args.where.key] } : null)) as never)
  })

  /** The calendar as it answers for a workshop: its saved week, or the default one. */
  const calendarWeek = (start: string, end: string) =>
    vi.mocked(loadWorkshopCalendar).mockResolvedValue({
      enabled: true,
      calendar: {
        timeZone: 'Pacific/Auckland',
        week: defaultWeek(start, end),
        closures: [],
        absences: [],
      },
    })

  it('are the workshop own words when it typed its hours but never set the calendar', async () => {
    // Nothing saved in the calendar, so the week it answers with is the default.
    calendarWeek('08:00', '17:00')
    expect(await loadPortalOpeningHours('org-real', 'Weekdays 7 to 4')).toBeNull()
  })

  it('are the calendar week once the workshop set it, whatever it typed before', async () => {
    stored['workshop.openingHours'] = JSON.stringify(defaultWeek('07:00', '16:00'))
    calendarWeek('07:00', '16:00')
    const hours = await loadPortalOpeningHours('org-real', 'Weekdays 7 to 4')
    expect(hours?.week[1]).toEqual({ open: true, start: '07:00', end: '16:00' })
  })

  it('are the default week when the workshop set nothing and typed nothing, as once signed in', async () => {
    calendarWeek('08:00', '17:00')
    const hours = await loadPortalOpeningHours('org-real', '  ')
    expect(hours?.week[1]).toEqual({ open: true, start: '08:00', end: '17:00' })
  })

  it('are the calendar week, on the workshop clock, and nothing else', async () => {
    vi.mocked(loadWorkshopCalendar).mockResolvedValue({
      enabled: true,
      calendar: {
        timeZone: 'Pacific/Auckland',
        week: defaultWeek('08:00', '17:00'),
        closures: [
          { name: 'Staff day', source: 'closure', startDate: '2026-11-20', endDate: '2026-11-20' },
        ],
        absences: [
          { id: 'a1', technicianId: 't1', startDate: '2026-11-17', endDate: '2026-11-17' },
        ] as never,
      },
    })

    const hours = await loadPortalOpeningHours('org-real')

    expect(hours).toEqual({
      week: defaultWeek('08:00', '17:00'),
      today: '2026-11-16',
      timeFormat: '24h',
      closedSoon: [{ date: '2026-11-20', name: 'Staff day', open: [] }],
    })
    expect(loadWorkshopCalendar).toHaveBeenCalledWith('org-real', expect.anything())
  })

  it('are nothing when the calendar has no day open, so the text can show', async () => {
    vi.mocked(loadWorkshopCalendar).mockResolvedValue({
      enabled: false,
      calendar: {
        timeZone: 'Pacific/Auckland',
        week: defaultWeek('08:00', '17:00').map((d) => ({ ...d, open: false })),
        closures: [],
        absences: [],
      },
    })
    expect(await loadPortalOpeningHours('org-real')).toBeNull()
  })

  it('are nothing, quietly, when the calendar cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(loadWorkshopCalendar).mockRejectedValue(new Error('db down'))
    expect(await loadPortalOpeningHours('org-real')).toBeNull()
  })
})
