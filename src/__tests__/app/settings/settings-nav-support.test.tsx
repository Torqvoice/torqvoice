import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsNav } from '@/app/(authenticated)/settings/settings-nav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/company',
  useRouter: () => ({ push: vi.fn() }),
}))

/** The links under one heading of the settings menu, in the order drawn. */
function linksUnder(heading: string) {
  const group = screen.getByText(heading).parentElement as HTMLElement
  return within(group)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'))
}

describe('Support in the settings menu', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sits under System, directly above About', () => {
    render(<SettingsNav isCloud supportEnabled />)

    const system = linksUnder('System')
    expect(system.slice(-2)).toEqual(['/settings/support', '/settings/about'])
    expect(linksUnder('General')).not.toContain('/settings/support')
  })

  it('says what the page is for when the row is pointed at', async () => {
    // The tooltip measures its trigger, which jsdom has nothing for.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {
          // nothing to watch in a test
        }
        unobserve() {
          // nothing to release in a test
        }
        disconnect() {
          // nothing to release in a test
        }
      }
    )
    render(<SettingsNav isCloud supportEnabled />)

    const row = screen.getByRole('link', { name: /Support/ })
    fireEvent.focus(row)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Get help & the support button')
  })

  it('stays out of the menu where support requests are switched off', () => {
    render(<SettingsNav isCloud={false} />)

    expect(linksUnder('System')).not.toContain('/settings/support')
  })
})
