/**
 * The analytics helper holds what a page sends before PostHog has started.
 * The provider starts PostHog in an effect in the root layout, and a page's
 * own mount effects run first, so without the hold a work order's view event
 * was lost on every full page load.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }))
vi.mock('posthog-js', () => ({ default: posthog }))

async function freshAnalytics() {
  vi.resetModules()
  return import('@/lib/analytics')
}

beforeEach(() => {
  posthog.capture.mockReset()
  posthog.register.mockReset()
})

describe('analytics', () => {
  it('holds events until PostHog has started, then sends them in order', async () => {
    const { track, registerAnalyticsProperties, analyticsStarted } = await freshAnalytics()

    registerAnalyticsProperties({ work_order_layout: 'modern' })
    track('work_order:page_view', { layout: 'modern' })
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.register).not.toHaveBeenCalled()

    analyticsStarted()
    expect(posthog.register).toHaveBeenCalledWith({ work_order_layout: 'modern' })
    expect(posthog.capture).toHaveBeenCalledWith('work_order:page_view', { layout: 'modern' })
    // The layout is registered before the view is sent, so the view carries it.
    expect(posthog.register.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.capture.mock.invocationCallOrder[0]
    )
  })

  it('sends straight away once PostHog has started, and sends nothing twice', async () => {
    const { track, analyticsStarted } = await freshAnalytics()
    track('work_order:layout_invite_dismiss')
    analyticsStarted()
    track('work_order:layout_switch', {
      from_layout: 'classic',
      to_layout: 'modern',
      source: 'banner',
    })
    analyticsStarted()

    expect(posthog.capture.mock.calls).toEqual([
      ['work_order:layout_invite_dismiss', undefined],
      [
        'work_order:layout_switch',
        { from_layout: 'classic', to_layout: 'modern', source: 'banner' },
      ],
    ])
  })

  it('sends nothing where PostHog never starts, and holds only a few events', async () => {
    const { track, analyticsStarted } = await freshAnalytics()
    for (let i = 0; i < 100; i++) track('work_order:page_view', { layout: 'classic' })
    expect(posthog.capture).not.toHaveBeenCalled()

    // Were it ever to start, the backlog is capped rather than a hundred views.
    analyticsStarted()
    expect(posthog.capture).toHaveBeenCalledTimes(20)
  })
})
