/**
 * The fullscreen control for the installed app.
 *
 * Two things here are easy to get wrong and invisible when they are. The
 * remembered preference must only ever be spent inside the installed app,
 * because hijacking the first click on a browser tab is hostile. And the
 * preference has to be written on the way out as well as the way in, or
 * turning fullscreen off is undone by the next launch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

let installed = false
vi.mock('@/components/pwa-install-prompt', () => ({
  useInstallPrompt: () => ({ installed }),
  SidebarInstallButton: () => null,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
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

const { FullscreenToggle } = await import('@/components/fullscreen-toggle')

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
    render(<FullscreenToggle />)

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
    render(<FullscreenToggle />)

    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('is not spent when nobody asked for it', () => {
    installed = true
    render(<FullscreenToggle />)

    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).not.toHaveBeenCalled()
  })

  it('is spent once, not on every click', () => {
    installed = true
    localStorage.setItem('app-fullscreen', 'true')
    render(<FullscreenToggle />)

    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
      document.dispatchEvent(new Event('pointerdown'))
    })
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
  })
})

describe('the button', () => {
  it('records the choice when turning fullscreen on', () => {
    render(<FullscreenToggle />)
    act(() => {
      screen.getByTestId('toggle').click()
    })
    expect(requestFullscreen).toHaveBeenCalled()
    expect(localStorage.getItem('app-fullscreen')).toBe('true')
  })

  it('records the choice when turning it off, so the next launch respects it', () => {
    localStorage.setItem('app-fullscreen', 'true')
    setFullscreen(true)
    render(<FullscreenToggle />)

    act(() => {
      screen.getByTestId('toggle').click()
    })
    expect(exitFullscreen).toHaveBeenCalled()
    expect(localStorage.getItem('app-fullscreen')).toBe('false')
  })

  it('is absent where the browser has no fullscreen to give', () => {
    // iOS Safari on the phone, where requesting it throws rather than refuses.
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true })
    render(<FullscreenToggle />)
    expect(screen.queryByTestId('toggle')).toBeNull()
  })
})
