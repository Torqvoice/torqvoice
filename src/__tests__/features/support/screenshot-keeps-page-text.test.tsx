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

// The same call the support form makes. In jsdom the capture itself cannot
// finish (no canvas), which is fine: the text has been shortened and put back
// by the time it gives up. Waiting is capped so a capture that never settles
// cannot hang the test.
async function takeScreenshot() {
  const { snapdom } = await import('@zumer/snapdom')
  await act(async () => {
    await Promise.race([
      snapdom
        .toBlob(document.body, { type: 'jpeg', quality: 0.7, backgroundColor: '#ffffff' })
        .catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Taking a support screenshot', () => {
  it('leaves truncated text on the page working', async () => {
    render(<JobCount />)
    const label = screen.getByTestId('label')
    makeTruncated(label)

    await takeScreenshot()
    expect(label.textContent).toBe('2 open jobs (urgent)')

    fireEvent.click(screen.getByRole('button', { name: 'Add job' }))
    expect(label.textContent).toBe('3 open jobs (urgent)')

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Clear urgent' }))
    ).not.toThrow()
    expect(label.textContent).toBe('3 open jobs')
  })
})
