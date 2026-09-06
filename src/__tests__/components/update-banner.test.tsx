/**
 * The "we deployed something" strip.
 *
 * The behaviour worth pinning is that it lets itself out. Almost nobody
 * presses the X, so without the six-hour clock the notice rides along until
 * the next release and stops being read at all. The clock is per browser, but
 * expiry writes the version server-side exactly as a real dismissal does, so
 * the banner does not come back on the user's other devices.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BannerSlotProvider } from '@/components/banner-slot'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const markVersionSeen = vi.fn()
vi.mock('@/features/users/Actions/versionActions', () => ({
  markVersionSeen: (version: string) => markVersionSeen(version),
}))

const { UpdateBanner } = await import('@/components/update-banner')

const SIX_HOURS = 6 * 60 * 60 * 1000

/** The banner only renders inside the slot it competes for. */
function show(lastSeenVersion: string | null = '1.0.0') {
  return render(
    <BannerSlotProvider>
      <UpdateBanner
        currentVersion="1.1.0"
        lastSeenVersion={lastSeenVersion}
        releaseNotesUrl="https://example.test/releases"
      />
    </BannerSlotProvider>
  )
}

function shown() {
  return screen.queryByText(/updated/)
}

beforeEach(() => {
  localStorage.clear()
  markVersionSeen.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the update banner', () => {
  it('announces a version the account has not seen', () => {
    show()
    expect(shown()).not.toBeNull()
  })

  it('stays gone once dismissed, and records the version', () => {
    show()
    act(() => {
      screen.getByRole('button').click()
    })
    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('1.1.0')
  })

  it('lets itself out six hours after it first appeared', () => {
    show()
    expect(shown()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(SIX_HOURS)
    })

    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('1.1.0')
  })

  it('keeps the clock running across reloads rather than restarting it', () => {
    show().unmount()

    // Five hours later, in a fresh tab: one hour left, not six.
    vi.setSystemTime(Date.now() + 5 * 60 * 60 * 1000)
    show()
    expect(shown()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000)
    })
    expect(shown()).toBeNull()
  })

  it('goes straight away when the six hours passed while the app was closed', () => {
    show().unmount()

    vi.setSystemTime(Date.now() + SIX_HOURS + 1000)
    show()

    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('1.1.0')
  })

  it('gives the next release its own six hours', () => {
    localStorage.setItem('update-banner-first-seen', `1.0.0|${Date.now() - SIX_HOURS - 1000}`)
    show()
    expect(shown()).not.toBeNull()
  })

  it('says nothing to an account seeing the app for the first time', () => {
    show(null)
    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('1.1.0')
  })
})
