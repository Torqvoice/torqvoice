/**
 * The "we deployed something" strip.
 *
 * Two things worth pinning. It only speaks for a minor or major release: a
 * patch is recorded as seen and shows nothing, because a strip for every
 * daily release was never read and never went away. And it lets itself out:
 * the hour runs on the user record from the first sighting on any
 * device, and expiry writes the version server-side exactly as a dismissal
 * does, so the banner does not come back anywhere.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BannerSlotProvider } from '@/components/banner-slot'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const markVersionSeen = vi.fn()
const markUpdateBannerShown = vi.fn()
vi.mock('@/features/users/Actions/versionActions', () => ({
  markVersionSeen: (version: string) => markVersionSeen(version),
  markUpdateBannerShown: (version: string) => markUpdateBannerShown(version),
}))

const { UpdateBanner } = await import('@/components/update-banner')

const ONE_HOUR = 60 * 60 * 1000

/** The banner only renders inside the slot it competes for. */
function show({
  currentVersion = 'v1.1.0',
  lastSeenVersion = 'v1.0.0' as string | null,
  shownVersion = null as string | null,
  shownAt = null as string | null,
} = {}) {
  return render(
    <BannerSlotProvider>
      <UpdateBanner
        currentVersion={currentVersion}
        lastSeenVersion={lastSeenVersion}
        shownVersion={shownVersion}
        shownAt={shownAt}
        releaseNotesUrl="https://example.test/releases"
      />
    </BannerSlotProvider>
  )
}

function shown() {
  return screen.queryByText(/updated/)
}

beforeEach(() => {
  markVersionSeen.mockClear()
  markUpdateBannerShown.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the update banner', () => {
  it('announces a minor release the account has not seen, and starts its clock', () => {
    show()
    expect(shown()).not.toBeNull()
    expect(markUpdateBannerShown).toHaveBeenCalledWith('v1.1.0')
    expect(markVersionSeen).not.toHaveBeenCalled()
  })

  it('says nothing for a patch release, and records it as seen', () => {
    show({ currentVersion: 'v1.0.1' })
    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('v1.0.1')
    expect(markUpdateBannerShown).not.toHaveBeenCalled()
  })

  it('stays gone once dismissed, and records the version', () => {
    show()
    act(() => {
      screen.getByRole('button').click()
    })
    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('v1.1.0')
  })

  it('lets itself out an hour after it first appeared', () => {
    show()
    expect(shown()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(ONE_HOUR)
    })

    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('v1.1.0')
  })

  it('runs the clock from the first sighting on any device, not from this load', () => {
    show({
      shownVersion: 'v1.1.0',
      shownAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    })
    expect(shown()).not.toBeNull()
    expect(markUpdateBannerShown).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })
    expect(shown()).toBeNull()
  })

  it('goes straight away when the hour passed while the app was closed', () => {
    show({ shownVersion: 'v1.1.0', shownAt: new Date(Date.now() - ONE_HOUR - 1000).toISOString() })
    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('v1.1.0')
  })

  it('says nothing to an account seeing the app for the first time', () => {
    show({ lastSeenVersion: null })
    expect(shown()).toBeNull()
    expect(markVersionSeen).toHaveBeenCalledWith('v1.1.0')
  })

  it('says nothing in development', () => {
    show({ currentVersion: 'development' })
    expect(shown()).toBeNull()
    expect(markVersionSeen).not.toHaveBeenCalled()
  })
})
