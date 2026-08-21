/**
 * The banner half of the platform-wide notice.
 *
 * The behaviour worth pinning is the dismissal. It is remembered per browser
 * and keyed on when the notice last changed, which is what makes a second
 * incident reach the people who dismissed the first one. Key it on anything
 * more stable and the next outage is invisible to everybody who was here for
 * the last.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BannerSlotProvider } from '@/components/banner-slot'
import { clearLiveBroadcast, setLiveBroadcast } from '@/components/broadcast-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const { BroadcastBanner } = await import('@/components/broadcast-banner')

/** The banner only renders inside the slot it competes for. */
function show(broadcast: Parameters<typeof BroadcastBanner>[0]['broadcast']) {
  return render(
    <BannerSlotProvider>
      <BroadcastBanner broadcast={broadcast} />
    </BannerSlotProvider>
  )
}

const NOTICE = {
  message: 'We are having trouble with our server infrastructure',
  level: 'critical' as const,
  updatedAt: '2026-08-21T10:00:00.000Z',
}

function shown() {
  return screen.queryByRole('status')
}

beforeEach(() => {
  localStorage.clear()
  clearLiveBroadcast()
})

describe('the notice banner', () => {
  it('shows the message', () => {
    show(NOTICE)
    expect(shown()?.textContent).toContain('server infrastructure')
  })

  it('renders nothing when there is no notice', () => {
    show(null)
    expect(shown()).toBeNull()
  })

  it('stays gone once dismissed', () => {
    show(NOTICE)
    act(() => {
      screen.getByRole('button').click()
    })
    expect(shown()).toBeNull()
    expect(localStorage.getItem('broadcast-dismissed')).toBe(NOTICE.updatedAt)
  })

  it('stays gone on the next load', () => {
    localStorage.setItem('broadcast-dismissed', NOTICE.updatedAt)
    show(NOTICE)
    expect(shown()).toBeNull()
  })

  it('comes back when the notice changes', () => {
    // The one that matters. A second incident has to reach the people who
    // waved the first one away.
    localStorage.setItem('broadcast-dismissed', NOTICE.updatedAt)
    show({ ...NOTICE, message: 'A different outage', updatedAt: '2026-08-22T09:00:00.000Z' })
    expect(shown()?.textContent).toContain('A different outage')
  })

  it('shows when the browser refuses storage', () => {
    // Private mode. Showing a notice twice is a smaller problem than never
    // showing one during an outage.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    show(NOTICE)
    expect(shown()).not.toBeNull()
    getItem.mockRestore()
  })

  it('takes a notice pushed over the socket without a reload', () => {
    // The point of the live channel. Someone already looking at a screen when
    // an incident is posted should see it there, not on their next click.
    show(null)
    expect(shown()).toBeNull()

    act(() => {
      setLiveBroadcast({ message: 'Just posted', level: 'warning', updatedAt: 'live-1' })
    })
    expect(shown()?.textContent).toContain('Just posted')
  })

  it('takes it away again when it is cleared', () => {
    show(NOTICE)
    expect(shown()).not.toBeNull()

    act(() => {
      setLiveBroadcast(null)
    })
    expect(shown()).toBeNull()
  })

  it('announces politely rather than interrupting', () => {
    // It is on screen and will not move, so there is no reason to cut across
    // whatever a screen reader is in the middle of.
    show(NOTICE)
    expect(shown()?.getAttribute('aria-live')).toBe('polite')
  })
})
