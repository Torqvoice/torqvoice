/**
 * The "Install Torqvoice" offer. It used to be a full-width bar pinned to the
 * bottom edge, which covered the sidebar foot with the account menu on a wide
 * screen and fought the phone tab bar for the same strip. It is now a floating
 * card lifted above the tab bar on a phone and kept to the bottom right
 * elsewhere. jsdom has no layout, so the placement is checked on its classes.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { InstallBanner } from '@/components/pwa-install-prompt'

function offerInstall() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  event.prompt = async () => undefined
  event.userChoice = Promise.resolve({ outcome: 'dismissed' })
  act(() => {
    window.dispatchEvent(event)
  })
}

describe('InstallBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia
  })

  it('floats clear of the tab bar and the sidebar foot instead of spanning the bottom edge', () => {
    render(<InstallBanner />)
    offerInstall()

    const card = screen.getByRole('region')
    expect(card.className).not.toMatch(/(^|\s)bottom-0(\s|$)/)
    // Above the phone tab bar, including the home-indicator inset.
    expect(card.className).toContain('bottom-[calc(4rem+env(safe-area-inset-bottom))]')
    // A fixed-width card at the right on wider screens, away from the sidebar.
    expect(card.className).toContain('md:right-4')
    expect(card.className).toContain('md:w-96')
    expect(card.className).toContain('md:inset-x-auto')
  })

  it('goes away when dismissed and stays away', () => {
    const { unmount } = render(<InstallBanner />)
    offerInstall()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('region')).toBeNull()

    unmount()
    render(<InstallBanner />)
    offerInstall()
    expect(screen.queryByRole('region')).toBeNull()
  })
})
