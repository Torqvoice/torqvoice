/**
 * The "What's new" button and the panel behind it.
 *
 * What a person at the counter notices: a button with a dot when something
 * shipped since they last looked, a panel of highlights when they press it,
 * the dot gone afterwards, and a thumb under each highlight that is sent the
 * moment it is pressed, with a box to say what went wrong.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WhatsNewEntry } from '@/features/whats-new/Schema/whatsNewSchema'

const markWhatsNewSeen = vi.fn(async () => ({ success: true }))
vi.mock('@/features/whats-new/Actions/markWhatsNewSeen', () => ({
  markWhatsNewSeen: () => markWhatsNewSeen(),
}))

const sendWhatsNewFeedback = vi.fn(async (_input: unknown) => ({ success: true }))
vi.mock('@/features/whats-new/Actions/sendWhatsNewFeedback', () => ({
  sendWhatsNewFeedback: (input: unknown) => sendWhatsNewFeedback(input),
}))

const loadMoreWhatsNew = vi.fn(async (_offset: unknown) => ({
  success: true,
  data: { entries: [] as WhatsNewEntry[], hasMore: false },
}))
vi.mock('@/features/whats-new/Actions/loadMoreWhatsNew', () => ({
  loadMoreWhatsNew: (offset: unknown) => loadMoreWhatsNew(offset),
}))

const toastError = vi.fn()
const toastPlain = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign((message: string) => toastPlain(message), {
    error: (message: string) => toastError(message),
  }),
}))

const { WhatsNewProvider } = await import('@/features/whats-new/Components/WhatsNewProvider')
const { WhatsNewAboutRows } = await import('@/features/whats-new/Components/WhatsNewAboutRows')

const ENTRIES: WhatsNewEntry[] = [
  {
    id: 'appointments',
    kind: 'new',
    title: 'Appointments on the calendar',
    body: '<p>Put a phone call on the calendar.</p>',
    imageUrl: null,
    ctaLabel: 'Open the calendar',
    ctaHref: '/calendar',
    docsHref: '/docs/features/calendar',
    minVersion: null,
    audience: 'all',
    subject: null,
    publishedAt: '2026-11-13T09:00:00.000Z',
  },
  {
    id: 'helpers',
    kind: 'improved',
    title: 'Several technicians on one job',
    body: '<p>A lead and helpers.</p>',
    imageUrl: null,
    ctaLabel: null,
    ctaHref: null,
    docsHref: null,
    minVersion: null,
    audience: 'all',
    subject: null,
    publishedAt: '2026-11-09T09:00:00.000Z',
  },
]

function show({
  entries = ENTRIES,
  unread = ['appointments'],
  feedback = 'anonymous' as 'identified' | 'anonymous' | null,
  tabHidden = false,
  hasMore = false,
} = {}) {
  return render(
    <WhatsNewProvider
      entries={entries}
      hasMore={hasMore}
      unreadIds={unread}
      initialTabHidden={tabHidden}
      timeZone="Europe/Oslo"
      appVersion="v2.14.0"
      releaseNotesUrl="https://example.test/releases"
      feedback={feedback}
    >
      <WhatsNewAboutRows />
    </WhatsNewProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe("What's new", () => {
  it('offers nothing to press when there is nothing to read', () => {
    show({ entries: [], unread: [] })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('says there is something unseen, then stops saying so once the panel was opened', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /updates you have not seen/ }))

    const panel = await screen.findByRole('dialog', { name: "What's new" })
    expect(within(panel).getByText('Appointments on the calendar')).toBeInTheDocument()
    expect(within(panel).getByText('Several technicians on one job')).toBeInTheDocument()
    // Only the entry that is news carries the marker.
    expect(within(panel).getAllByLabelText('New since you last looked')).toHaveLength(1)
    expect(markWhatsNewSeen).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: "What's new" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /have not seen/ })).not.toBeInTheDocument()
  })

  it('links a highlight to the screen it is about and to its guide', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /What's new/ }))

    expect(screen.getByRole('link', { name: /Open the calendar/ })).toHaveAttribute(
      'href',
      '/calendar'
    )
    expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
      'href',
      'https://torqvoice.com/docs/features/calendar'
    )
  })

  it('sends a thumbs down at once, then the comment that explains it', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /What's new/ }))

    const first = screen.getByText('Appointments on the calendar').closest('article') as HTMLElement
    await user.click(within(first).getByRole('button', { name: 'No, not what I expected' }))
    expect(sendWhatsNewFeedback).toHaveBeenCalledWith({ entryId: 'appointments', vote: 'down' })

    const box = await within(first).findByLabelText('What did not work the way you expected?')
    expect(
      within(first).getByText('Sent to the Torqvoice team without your name or email address.')
    ).toBeInTheDocument()
    await user.type(box, 'The reminder never arrived')
    await user.click(within(first).getByRole('button', { name: 'Send' }))

    expect(sendWhatsNewFeedback).toHaveBeenLastCalledWith({
      entryId: 'appointments',
      vote: 'down',
      comment: 'The reminder never arrived',
    })
    expect(await within(first).findByText('Thank you, your comment was sent.')).toBeInTheDocument()
  })

  it('tells a cloud workshop that their email goes with the comment', async () => {
    const user = userEvent.setup()
    show({ feedback: 'identified' })
    await user.click(screen.getByRole('button', { name: /What's new/ }))
    const first = screen.getByText('Appointments on the calendar').closest('article') as HTMLElement
    await user.click(within(first).getByRole('button', { name: 'Yes, this is useful' }))
    expect(
      await within(first).findByText(
        'Sent to the Torqvoice team with your email address, so we can reply.'
      )
    ).toBeInTheDocument()
  })

  it('takes the thumb back and says so when the vote could not be sent', async () => {
    sendWhatsNewFeedback.mockResolvedValueOnce({ success: false })
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /What's new/ }))
    const first = screen.getByText('Appointments on the calendar').closest('article') as HTMLElement
    const down = within(first).getByRole('button', { name: 'No, not what I expected' })
    await user.click(down)

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(down).toHaveAttribute('aria-pressed', 'false')
    expect(within(first).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('has no thumbs where sending is switched off', async () => {
    const user = userEvent.setup()
    show({ feedback: null })
    await user.click(screen.getByRole('button', { name: /What's new/ }))
    expect(screen.queryByText('Was this useful?')).not.toBeInTheDocument()
  })
})

describe("What's new, when things go wrong", () => {
  it('keeps the dot when opening the panel could not be recorded, and tries again next time', async () => {
    markWhatsNewSeen.mockResolvedValueOnce({ success: false })
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /updates you have not seen/ }))
    await user.keyboard('{Escape}')

    const again = await screen.findByRole('button', { name: /updates you have not seen/ })
    await user.click(again)
    expect(markWhatsNewSeen).toHaveBeenCalledTimes(2)
  })

  it('does not take a second vote while the first is still on its way', async () => {
    let finish: (value: { success: boolean }) => void = () => undefined
    sendWhatsNewFeedback.mockImplementationOnce(
      () => new Promise<{ success: boolean }>((resolve) => (finish = resolve))
    )
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /What's new/ }))
    const first = screen.getByText('Appointments on the calendar').closest('article') as HTMLElement
    await user.click(within(first).getByRole('button', { name: 'No, not what I expected' }))

    const up = within(first).getByRole('button', { name: 'Yes, this is useful' })
    expect(up).toBeDisabled()
    await user.click(up)
    expect(sendWhatsNewFeedback).toHaveBeenCalledTimes(1)

    finish({ success: true })
    await waitFor(() => expect(up).toBeEnabled())
  })

  it('does not follow a button address that would leave the app', async () => {
    const user = userEvent.setup()
    show({
      entries: [{ ...ENTRIES[0], ctaHref: '/\\evil.example' }],
      unread: [],
    })
    await user.click(screen.getByRole('button', { name: "What's new" }))
    expect(screen.queryByRole('link', { name: /Open the calendar/ })).not.toBeInTheDocument()
  })
})

describe("the What's new tab on the edge of the screen", () => {
  it('can be sent away, says where to get it back, and stays away', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Hide this tab' }))

    expect(screen.queryByRole('button', { name: /^What's new/ })).not.toBeInTheDocument()
    expect(toastPlain).toHaveBeenCalledWith(
      'Tab hidden. You can turn it back on in Settings, About.'
    )
    expect(document.cookie).toContain('whatsNewTab=hidden')
  })

  it('is not drawn for somebody who hid it, but the news can still be opened from About', async () => {
    const user = userEvent.setup()
    show({ tabHidden: true })
    expect(screen.queryByRole('button', { name: /^What's new/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'See what is new' }))
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument()
  })

  it('comes back when it is switched on again in About', async () => {
    const user = userEvent.setup()
    show({ tabHidden: true })
    const toggle = screen.getByRole('switch', {
      name: /Show the What's new tab at the side of the screen/,
    })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)

    expect(screen.getByRole('button', { name: /^What's new/ })).toBeInTheDocument()
    expect(document.cookie).toContain('whatsNewTab=shown')
  })
})

describe("older highlights in the What's new panel", () => {
  it('offers nothing more when the first page is all there is', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: /^What's new/ }))
    expect(screen.queryByRole('button', { name: 'Show older updates' })).not.toBeInTheDocument()
  })

  it('adds the next page under the ones already shown, and stops offering at the end', async () => {
    loadMoreWhatsNew.mockResolvedValueOnce({
      success: true,
      data: {
        entries: [{ ...ENTRIES[1], id: 'closures', title: 'Closed days and staff leave' }],
        hasMore: false,
      },
    })
    const user = userEvent.setup()
    show({ hasMore: true })
    await user.click(screen.getByRole('button', { name: /^What's new/ }))
    await user.click(screen.getByRole('button', { name: 'Show older updates' }))

    expect(loadMoreWhatsNew).toHaveBeenCalledWith(ENTRIES.length)
    expect(await screen.findByText('Closed days and staff leave')).toBeInTheDocument()
    expect(screen.getByText('Appointments on the calendar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show older updates' })).not.toBeInTheDocument()
  })
})
