/**
 * The wall screen moves on to the next day at the workshop's midnight.
 *
 * The presenter checks the date once a minute. A live update from another
 * desk sets that check up again, and one landing after midnight but before
 * the next tick used to start the check over on the new date, so the screen
 * kept showing yesterday for another whole day.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkshopDayRollover } from '@/features/workboard/hooks/useWorkshopDayRollover'

const WORKSHOP_ZONE = 'Europe/Oslo'

beforeEach(() => {
  vi.useFakeTimers()
  // 23:58 in Oslo on 10 November.
  vi.setSystemTime(new Date('2026-11-10T22:58:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the wall screen at midnight', () => {
  it('moves on to the new day on the next check', () => {
    const onNewDay = vi.fn()
    renderHook(() => useWorkshopDayRollover(WORKSHOP_ZONE, onNewDay))

    vi.advanceTimersByTime(60_000)
    expect(onNewDay).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60_000)
    expect(onNewDay).toHaveBeenCalledWith('2026-11-11')
    expect(onNewDay).toHaveBeenCalledTimes(1)
  })

  it('moves on when a live update arrives between midnight and the next check', () => {
    const first = vi.fn()
    const { rerender } = renderHook(
      ({ onNewDay }) => useWorkshopDayRollover(WORKSHOP_ZONE, onNewDay),
      {
        initialProps: { onNewDay: first },
      }
    )

    // Past midnight, but the minute's check has not run yet.
    vi.setSystemTime(new Date('2026-11-10T23:00:10Z'))
    // A job changed at another desk: the board hands the check a new callback,
    // which sets it up again.
    const second = vi.fn()
    rerender({ onNewDay: second })

    expect(second).toHaveBeenCalledWith('2026-11-11')
    expect(first).not.toHaveBeenCalled()

    // And only once: later checks and further updates the same day do nothing.
    const third = vi.fn()
    rerender({ onNewDay: third })
    vi.advanceTimersByTime(5 * 60_000)
    expect(second).toHaveBeenCalledTimes(1)
    expect(third).not.toHaveBeenCalled()
  })

  it('keeps the day it opened on through the day, however often it is set up again', () => {
    const onNewDay = vi.fn()
    const { rerender } = renderHook(({ cb }) => useWorkshopDayRollover(WORKSHOP_ZONE, cb), {
      initialProps: { cb: onNewDay },
    })

    rerender({ cb: vi.fn() })
    rerender({ cb: onNewDay })
    vi.advanceTimersByTime(60_000)

    expect(onNewDay).not.toHaveBeenCalled()
  })
})
