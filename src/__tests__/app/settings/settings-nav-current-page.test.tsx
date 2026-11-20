import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsNav } from '@/app/(authenticated)/settings/settings-nav'

let pathname = '/settings/about'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

/**
 * The settings menu is longer than the window. Landing on a page far down it,
 * from a link or the search, has to bring that page's row into view.
 */
describe('the settings menu and the page that is open', () => {
  const scrolled: string[] = []
  const original = Element.prototype.scrollIntoView
  beforeEach(() => {
    scrolled.length = 0
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute('href') ?? '')
    }
  })
  afterEach(() => {
    Element.prototype.scrollIntoView = original
    vi.unstubAllGlobals()
  })

  it('brings the open page into view and marks it as the current one', () => {
    pathname = '/settings/about'
    render(<SettingsNav isCloud supportEnabled />)

    expect(scrolled).toEqual(['/settings/about'])
    expect(screen.getByRole('link', { name: /About/ })).toHaveAttribute('aria-current', 'page')
  })

  it('follows when another page opens', () => {
    pathname = '/settings/about'
    const { rerender } = render(<SettingsNav isCloud supportEnabled />)
    pathname = '/settings/company'
    rerender(<SettingsNav isCloud supportEnabled />)

    expect(scrolled).toEqual(['/settings/about', '/settings/company'])
  })

  it('looks again when the list appears after the window widens', () => {
    let resized: () => void = () => undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback
        }
        observe() {
          // nothing to watch in a test
        }
        disconnect() {
          // nothing to release in a test
        }
      }
    )
    pathname = '/settings/about'
    render(<SettingsNav isCloud supportEnabled />)
    scrolled.length = 0
    const nav = screen.getByRole('navigation')

    // Hidden so far (no height); nothing to do while it stays hidden.
    resized()
    expect(scrolled).toEqual([])

    Object.defineProperty(nav, 'offsetHeight', { configurable: true, value: 600 })
    resized()
    expect(scrolled).toEqual(['/settings/about'])
  })
})
