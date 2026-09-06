/**
 * The fullscreen control for the installed app.
 *
 * Two things here are easy to get wrong and invisible when they are. The
 * remembered preference must only ever be spent inside the installed app,
 * because hijacking the first click on a browser tab is hostile. And the
 * preference has to be written on the way out as well as the way in, or
 * turning fullscreen off is undone by the next launch.
 *
 * The two halves are separate components: the launcher is always mounted so
 * it can catch the first gesture, while the menu item only exists once the
 * account menu is open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

let installed = false
vi.mock('@/components/pwa-install-prompt', () => ({
  useInstallPrompt: () => ({ installed }),
  InstallMenuItem: () => null,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button type="button" data-testid="toggle" onClick={onClick}>
      {children}
    </button>
  ),
}))

const { FullscreenLauncher, FullscreenMenuItem } = await import('@/components/fullscreen-toggle')

const requestFullscreen = vi.fn().mockResolvedValue(undefined)
const exitFullscreen = vi.fn().mockResolvedValue(undefined)

function setFullscreen(on: boolean) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: on ? document.documentElement : null,
    configurable: true,
  })
}

beforeEach(() => {
  installed = false
  localStorage.clear()
  requestFullscreen.mockClear()
  exitFullscreen.mockClear()
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
  document.documentElement.requestFullscreen = requestFullscreen
  document.exitFullscreen = exitFullscreen
  setFullscreen(false)
})

afterEach(() => {
  localStorage.clear()
})

describe('the remembered preference', () => {
  it('is spent on the first gesture inside the installed app', () => {
    installed = true
    localStorage.setItem('app-fullscreen', 'true')
    render(<FullscreenLauncher />)

    expect(requestFullscreen).not.toHaveBeenCalled()
    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('is ignored in a browser tab', () => {
    // Taking over the first click of a page somebody opened alongside others
    // is the difference between a feature and a hijack.
    installed = false
    localStorage.setItem('app-fullscreen', 'true')
    render(<FullscreenLauncher />)

    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('is not spent when nobody asked for it', () => {
    installed = true
    render(<FullscreenLauncher />)

    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('is spent once, not on every click', () => {
    installed = true
    localStorage.setItem('app-fullscreen', 'true')
    render(<FullscreenLauncher />)

    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })
})

describe('the menu item', () => {
  it('records the choice when turning fullscreen on', () => {
    render(<FullscreenMenuItem />)
    act(() => {
      screen.getByTestId('toggle').click()
    })
    expect(requestFullscreen).toHaveBeenCalled()
    expect(localStorage.getItem('app-fullscreen')).toBe('true')
  })

  it('records the choice when turning it off, so the next launch respects it', () => {
    localStorage.setItem('app-fullscreen', 'true')
    setFullscreen(true)
    render(<FullscreenMenuItem />)

    act(() => {
      screen.getByTestId('toggle').click()
    })
    expect(exitFullscreen).toHaveBeenCalled()
    expect(localStorage.getItem('app-fullscreen')).toBe('false')
  })

  it('is absent where the browser has no fullscreen to give', () => {
    // iOS Safari on the phone, where requesting it throws rather than refuses.
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true })
    render(<FullscreenMenuItem />)
    expect(screen.queryByTestId('toggle')).toBeNull()
  })
})
