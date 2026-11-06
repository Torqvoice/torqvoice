import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The support form's "Take Screenshot" captures the live page with snapdom.
// Before capturing, snapdom shortens every truncated text to bake in the "…"
// and puts the text back afterwards. snapdom 2.23.1 did that through
// textContent, which swaps React's text nodes for new ones: the text then
// stopped updating, and the next change that removed part of it crashed the
// page ("removeChild: the node to be removed is not a child of this node").

function JobCount() {
  const [count, setCount] = useState(2)
  const [urgent, setUrgent] = useState(true)
  return (
    <div>
      <span data-testid="label" className="truncate">
        {count} open jobs{urgent && ' (urgent)'}
      </span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Add job
      </button>
      <button type="button" onClick={() => setUrgent(false)}>
        Clear urgent
      </button>
    </div>
  )
}

// jsdom has no layout, so make the label look cut off with an ellipsis, the way
// Tailwind's `truncate` renders it in a browser.
function makeTruncated(element: HTMLElement) {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, get: () => 400 })
  Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => 80 })
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target, pseudo) => {
    const style = original(target, pseudo)
    if (target !== element) return style
    return new Proxy(style, {
      get(base, key) {
        if (key === 'textOverflow') return 'ellipsis'
        if (key === 'whiteSpace') return 'nowrap'
        if (key === 'overflowX') return 'hidden'
        const value = Reflect.get(base, key)
        return typeof value === 'function' ? value.bind(base) : value
      },
    })
  })
}

// The same call the support form makes. In jsdom the capture cannot finish
// rendering (no canvas), so a rejection is expected; what matters is that the
// label was shortened and put back on the way. Returns every text the label
// showed during the capture, so the test can prove that happened rather than
// pass against a capture that gave up before reaching it. A capture that
// never settles fails the test instead of passing quietly.
async function takeScreenshot(label: HTMLElement) {
  const { snapdom } = await import('@zumer/snapdom')
  const shown: string[] = []
  const observer = new MutationObserver(() => shown.push(label.textContent ?? ''))
  observer.observe(label, { characterData: true, childList: true, subtree: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await act(async () => {
      await Promise.race([
        snapdom
          .toBlob(document.body, { type: 'jpeg', quality: 0.7, backgroundColor: '#ffffff' })
          .catch(() => undefined),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('the capture did not settle')), 2000)
        }),
      ])
    })
  } finally {
    clearTimeout(timer)
    if (observer.takeRecords().length > 0) shown.push(label.textContent ?? '')
    observer.disconnect()
  }
  return shown
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Taking a support screenshot', () => {
  it('leaves truncated text on the page working', async () => {
    render(<JobCount />)
    const label = screen.getByTestId('label')
    makeTruncated(label)

    const shownDuringCapture = await takeScreenshot(label)
    // The capture really reached the label: it was cut to an ellipsis...
    expect(shownDuringCapture.some((text) => text.endsWith('…'))).toBe(true)
    // ...and put back afterwards
    expect(label.textContent).toBe('2 open jobs (urgent)')

    fireEvent.click(screen.getByRole('button', { name: 'Add job' }))
    expect(label.textContent).toBe('3 open jobs (urgent)')

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Clear urgent' }))
    ).not.toThrow()
    expect(label.textContent).toBe('3 open jobs')
  })
})
