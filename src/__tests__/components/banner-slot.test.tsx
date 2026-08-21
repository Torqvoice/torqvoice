/**
 * One full-width strip at a time.
 *
 * These bars are pinned above everything and were rendered independently in
 * three different layouts, so two at once pushed the whole app down by two
 * bars. Nothing stopped a fourth being added, and three notices on screen at
 * once are three nobody reads.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { BannerSlotProvider, useBannerSlot, BANNER_PRIORITY } from '@/components/banner-slot'

function Strip({
  id,
  priority,
  wants = true,
}: {
  id: string
  priority: number
  wants?: boolean
}) {
  const mine = useBannerSlot(id, priority, wants)
  return mine ? <div data-testid={`strip-${id}`}>{id}</div> : null
}

function visible() {
  return screen
    .queryAllByTestId(/^strip-/)
    .map((el) => el.getAttribute('data-testid')?.replace('strip-', ''))
}

describe('the banner queue', () => {
  it('shows the loudest of several', () => {
    render(
      <BannerSlotProvider>
        <Strip id="update" priority={BANNER_PRIORITY.update} />
        <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
        <Strip id="licence" priority={BANNER_PRIORITY.licence} />
      </BannerSlotProvider>
    )
    expect(visible()).toEqual(['broadcast'])
  })

  it('shows nothing extra, whatever the order they mount in', () => {
    render(
      <BannerSlotProvider>
        <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
        <Strip id="demo" priority={BANNER_PRIORITY.demo} />
      </BannerSlotProvider>
    )
    expect(visible()).toHaveLength(1)
  })

  it('lets the next one through when the winner stands down', () => {
    // Dismissing the top notice should reveal the one behind it, not lose it.
    const { rerender } = render(
      <BannerSlotProvider>
        <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
        <Strip id="update" priority={BANNER_PRIORITY.update} />
      </BannerSlotProvider>
    )
    expect(visible()).toEqual(['broadcast'])

    act(() => {
      rerender(
        <BannerSlotProvider>
          <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} wants={false} />
          <Strip id="update" priority={BANNER_PRIORITY.update} />
        </BannerSlotProvider>
      )
    })
    expect(visible()).toEqual(['update'])
  })

  it('frees the slot when the winner unmounts entirely', () => {
    const { rerender } = render(
      <BannerSlotProvider>
        <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
        <Strip id="update" priority={BANNER_PRIORITY.update} />
      </BannerSlotProvider>
    )
    act(() => {
      rerender(
        <BannerSlotProvider>
          <Strip id="update" priority={BANNER_PRIORITY.update} />
        </BannerSlotProvider>
      )
    })
    expect(visible()).toEqual(['update'])
  })

  it('survives a second instance of the same banner going away', () => {
    // The admin card previews the real banner, so two of them are mounted
    // while that page is open. The preview unmounting must not take the page
    // banner's claim with it, which is what "the notice only shows on the
    // settings page" turned out to be.
    const { rerender } = render(
      <BannerSlotProvider>
        <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
        <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
      </BannerSlotProvider>
    )
    act(() => {
      rerender(
        <BannerSlotProvider>
          <Strip id="broadcast" priority={BANNER_PRIORITY.broadcast} />
        </BannerSlotProvider>
      )
    })
    expect(visible()).toEqual(['broadcast'])
  })

  it('shows nothing when nobody has anything to say', () => {
    render(
      <BannerSlotProvider>
        <Strip id="update" priority={BANNER_PRIORITY.update} wants={false} />
      </BannerSlotProvider>
    )
    expect(visible()).toEqual([])
  })

  it('keeps the notice above every other strip', () => {
    // The ordering that matters: an incident outranks housekeeping.
    expect(BANNER_PRIORITY.broadcast).toBeGreaterThan(BANNER_PRIORITY.demo)
    expect(BANNER_PRIORITY.broadcast).toBeGreaterThan(BANNER_PRIORITY.licence)
    expect(BANNER_PRIORITY.broadcast).toBeGreaterThan(BANNER_PRIORITY.update)
  })
})
