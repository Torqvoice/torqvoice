/**
 * The card itself, rather than the queue behind it.
 *
 * The rule worth pinning is what counts as having been told. A hint about a
 * toggle somebody just flipped may close on any click, but an announcement is
 * dismissed once for the whole workshop, so a stray click at the other end of
 * the screen must not spend that on everybody's behalf.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const dismissFeatureHint = vi.fn().mockResolvedValue({ success: true, data: { seen: [] } })
vi.mock('@/features/settings/Actions/featureHintActions', () => ({
  dismissFeatureHint: (id: string) => dismissFeatureHint(id),
}))

// Radix positions the card with floating-ui, which measures its anchor. jsdom
// has no ResizeObserver, and without one the content never mounts. Nothing
// here needs measuring: these tests are about what the card does, not where
// it lands.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
class StubObserver {
  observe = noop
  unobserve = noop
  disconnect = noop
}
vi.stubGlobal('ResizeObserver', StubObserver)
vi.stubGlobal('DOMRect', class {})

const { FeatureHintProvider } = await import('@/components/feature-hint/feature-hint-provider')
const { FeatureHint } = await import('@/components/feature-hint/feature-hint')

async function renderCard(props: { variant?: 'hint' | 'announcement' } = {}) {
  render(
    <FeatureHintProvider initialSeen={[]} pending={['designer.v1']}>
      <FeatureHint
        id="designer.v1"
        eligible
        title="Invoices have been overhauled"
        body="Open the new designer."
        href="/invoice-designer"
        cta="Open the designer"
        {...props}
      >
        <button type="button">Settings</button>
      </FeatureHint>
    </FeatureHintProvider>
  )
  // Radix arms its outside-click listener in a timeout, so a click dispatched
  // straight after render lands before anything is listening. Without this
  // wait the outside-click tests pass whatever the component does.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** A click that lands anywhere but the card. */
function clickOutside() {
  act(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
    )
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  })
}

const showing = () => screen.queryByText('Invoices have been overhauled') !== null

beforeEach(() => {
  dismissFeatureHint.mockClear()
})

describe('an announcement waiting to be acknowledged', () => {
  it('shows its two ways out', async () => {
    await renderCard({ variant: 'announcement' })
    expect(showing()).toBe(true)
    expect(screen.getByText('Open the designer')).toBeInTheDocument()
    expect(screen.getByText('Got it')).toBeInTheDocument()
  })

  it('survives a click that lands somewhere else', async () => {
    // The reported bug: reading the card, clicking anywhere, and never being
    // able to get it back, for the whole workshop.
    await renderCard({ variant: 'announcement' })
    clickOutside()
    expect(showing()).toBe(true)
    expect(dismissFeatureHint).not.toHaveBeenCalled()
  })

  it('closes when the acknowledgement is actually pressed', async () => {
    await renderCard({ variant: 'announcement' })
    act(() => {
      screen.getByText('Got it').click()
    })
    expect(showing()).toBe(false)
    expect(dismissFeatureHint).toHaveBeenCalledWith('designer.v1')
  })
})

describe('how loud the card is', () => {
  /** The popover surface, which is what carries the card's colours. */
  const surface = () =>
    screen.getByText('Invoices have been overhauled').closest('[data-slot="popover-content"]')

  it('gives an announcement the surface a selected sidebar link wears', async () => {
    // Left on the default popover surface it is white on a white page, which
    // is how an announcement goes unread.
    await renderCard({ variant: 'announcement' })
    expect(surface()?.className).toContain('bg-sidebar-accent')
  })

  it('keeps that surface opaque, so the page cannot read through the card', async () => {
    // An alpha modifier here would tint nicely and leave the card's own text
    // sitting over whatever it happens to be floating above.
    await renderCard({ variant: 'announcement' })
    expect(surface()?.className).not.toMatch(/bg-sidebar-accent\//)
  })

  it('leaves an ordinary hint on the usual popover surface', async () => {
    await renderCard()
    expect(surface()?.className).not.toContain('bg-sidebar-accent')
  })
})

describe('a hint about something just switched on', () => {
  it('still closes on a click elsewhere', async () => {
    // Unchanged from before announcements existed: somebody who flipped the
    // toggle already knows, so any click is fair evidence they are done.
    await renderCard()
    clickOutside()
    expect(showing()).toBe(false)
    expect(dismissFeatureHint).toHaveBeenCalledWith('designer.v1')
  })
})
