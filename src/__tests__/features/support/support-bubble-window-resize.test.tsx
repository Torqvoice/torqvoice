import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupportBubble } from '@/features/support/Components/SupportBubble'

// The support button belongs to a corner of the window. A tab that had been in
// a small window kept the place the small window forced on it, so making the
// window large again left the button in the middle of the screen. Below a
// laptop's width the button is not drawn at all, which is why nobody saw it
// move until the window was large again.

const LARGE = { width: 1440, height: 900 }
const SMALL = { width: 390, height: 600 }
/** Wide enough to keep the button, too short for where it was. */
const SHORT = { width: 1100, height: 420 }
const BUTTON = 48

function windowIs(size: { width: number; height: number }) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.height })
}

/** Listeners the page has on its media queries, told when the window changes. */
const mediaListeners = new Set<() => void>()

function resizeWindowTo(size: { width: number; height: number }) {
  act(() => {
    windowIs(size)
    window.dispatchEvent(new Event('resize'))
    for (const listener of mediaListeners) listener()
  })
}

function button() {
  return screen.getByRole('button', { name: 'Contact support' })
}

function expectNoButton() {
  expect(screen.queryByRole('button', { name: 'Contact support' })).not.toBeInTheDocument()
}

/** Where the button is, as its distance to each edge of the window. */
function place() {
  const left = Number.parseFloat(button().style.left)
  const top = Number.parseFloat(button().style.top)
  return {
    left,
    top,
    right: window.innerWidth - left - BUTTON,
    bottom: window.innerHeight - top - BUTTON,
  }
}

function expectFullyOnScreen() {
  const { left, top, right, bottom } = place()
  expect(left).toBeGreaterThanOrEqual(0)
  expect(top).toBeGreaterThanOrEqual(0)
  expect(right).toBeGreaterThanOrEqual(0)
  expect(bottom).toBeGreaterThanOrEqual(0)
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

/** Drags the button so that its top-left corner ends at the given point. */
function dragButtonTo(x: number, y: number) {
  const from = place()
  const target = button()
  act(() => {
    fireEvent(target, pointer('pointerdown', from.left + 10, from.top + 10))
  })
  act(() => {
    fireEvent(target, pointer('pointermove', x + 10, y + 10))
  })
  act(() => {
    fireEvent(target, pointer('pointerup', x + 10, y + 10))
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  vi.stubGlobal(
    'matchMedia',
    // A computer with a mouse: the only thing that hides the button is a
    // window narrower than a laptop's.
    vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return query.includes('max-width: 1023px') && window.innerWidth < 1024
      },
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
    }))
  )
  windowIs(LARGE)
})

afterEach(() => {
  mediaListeners.clear()
  vi.unstubAllGlobals()
  windowIs({ width: 1024, height: 768 })
})

describe('The support button when the window changes size', () => {
  it('is back in its corner when a window that was made small is large again', () => {
    render(<SupportBubble userId="anna" />)
    expect(place()).toMatchObject({ right: 24, bottom: 24 })

    resizeWindowTo(SMALL)
    expectNoButton()

    resizeWindowTo(LARGE)
    expect(place()).toMatchObject({ right: 24, bottom: 24 })
  })

  it('goes to the corner of the large window when the tab was opened in a small one', () => {
    windowIs(SMALL)
    render(<SupportBubble userId="anna" />)
    expectNoButton()

    resizeWindowTo(LARGE)
    expect(place()).toMatchObject({ right: 24, bottom: 24 })
  })

  it('stays in its corner, fully on screen, in a window that is only made shorter', () => {
    render(<SupportBubble userId="anna" />)

    resizeWindowTo(SHORT)
    expect(place()).toMatchObject({ right: 24, bottom: 24 })

    resizeWindowTo(LARGE)
    expect(place()).toMatchObject({ right: 24, bottom: 24 })
  })

  it('keeps a dragged button the same distance from the corner it was left near', () => {
    render(<SupportBubble userId="anna" />)
    dragButtonTo(1200, 200)
    expect(place()).toMatchObject({ left: 1200, top: 200 })
    const chosen = place()

    // Too short and too narrow for where it was: pushed inward, not lost.
    resizeWindowTo(SHORT)
    expectFullyOnScreen()
    resizeWindowTo(SMALL)
    expectNoButton()

    resizeWindowTo(LARGE)
    expect(place()).toEqual(chosen)

    resizeWindowTo({ width: 1920, height: 1080 })
    expect(place()).toMatchObject({ right: chosen.right, top: 200 })
  })

  it('keeps a button dragged to the left side on the left', () => {
    render(<SupportBubble userId="anna" />)
    dragButtonTo(40, 700)

    resizeWindowTo(SMALL)
    resizeWindowTo({ width: 1920, height: 1080 })

    expect(place()).toMatchObject({ left: 40, bottom: 900 - 700 - BUTTON })
  })

  it('remembers where it was dragged after a reload, also one made in a smaller window', () => {
    const first = render(<SupportBubble userId="anna" />)
    dragButtonTo(1200, 200)
    const chosen = place()
    first.unmount()

    windowIs(SHORT)
    render(<SupportBubble userId="anna" />)
    expectFullyOnScreen()

    resizeWindowTo(LARGE)
    expect(place()).toEqual(chosen)
  })

  describe('with a place saved before this change, as pixels from the top-left', () => {
    function savedByAnEarlierBuild(x: number, y: number) {
      window.localStorage.setItem('torqvoice.support.position', JSON.stringify({ x, y }))
    }

    it('is still where it was, and comes back there after a small window', () => {
      savedByAnEarlierBuild(1200, 200)
      render(<SupportBubble userId="anna" />)
      expect(place()).toMatchObject({ left: 1200, top: 200 })

      resizeWindowTo(SMALL)
      resizeWindowTo(LARGE)

      expect(place()).toMatchObject({ left: 1200, top: 200 })
    })

    it('goes back to it when the tab was first opened in a window too small for it', () => {
      savedByAnEarlierBuild(1200, 700)
      windowIs(SHORT)
      render(<SupportBubble userId="anna" />)
      expectFullyOnScreen()

      resizeWindowTo(LARGE)

      expect(place()).toMatchObject({ left: 1200, top: 700 })
    })

    it('is not lost by a reload in a window too small for it', () => {
      savedByAnEarlierBuild(1200, 700)
      windowIs(SHORT)
      const first = render(<SupportBubble userId="anna" />)
      first.unmount()
      windowIs(SMALL)
      const second = render(<SupportBubble userId="anna" />)
      second.unmount()

      windowIs(LARGE)
      render(<SupportBubble userId="anna" />)

      expect(place()).toMatchObject({ left: 1200, top: 700 })
    })

    it('keeps its distance to the corner after a resize followed by a reload', () => {
      savedByAnEarlierBuild(1200, 700)
      const first = render(<SupportBubble userId="anna" />)
      const chosen = place()
      resizeWindowTo(SHORT)
      first.unmount()

      render(<SupportBubble userId="anna" />)
      expectFullyOnScreen()
      resizeWindowTo(LARGE)
      expect(place()).toEqual(chosen)

      resizeWindowTo({ width: 1920, height: 1080 })
      expect(place()).toMatchObject({ right: chosen.right, bottom: chosen.bottom })
    })

    it('gives way to a new place the moment the button is dragged', () => {
      savedByAnEarlierBuild(1200, 700)
      windowIs(SHORT)
      render(<SupportBubble userId="anna" />)
      dragButtonTo(40, 100)

      resizeWindowTo(LARGE)

      expect(place()).toMatchObject({ left: 40, top: 100 })
    })
  })

  it('opens the form on the click after a resize, not a drag', () => {
    render(<SupportBubble userId="anna" />)
    resizeWindowTo(SMALL)
    resizeWindowTo(LARGE)

    act(() => button().click())

    expect(screen.getByLabelText('Subject')).toBeInTheDocument()
  })
})
