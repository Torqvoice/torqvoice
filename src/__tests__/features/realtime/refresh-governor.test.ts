/**
 * When a page may read its record again.
 *
 * The complaint that started this file was a page that sent a GET to the
 * server every second, for ever. A live event is answered with a request, so
 * anything that turns a request back into an event is a page that polls, and
 * it looks exactly like the feature working. These tests are the ceiling on
 * what that can ever cost.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRefreshGovernor, MAX_GAP_MS } from '@/features/realtime/refresh-governor'

let hidden = false
let refresh: ReturnType<typeof vi.fn<() => void>>

const make = () => createRefreshGovernor({ refresh, isHidden: () => hidden })

beforeEach(() => {
  vi.useFakeTimers()
  hidden = false
  refresh = vi.fn<() => void>()
})
afterEach(() => vi.useRealTimers())

describe('an ordinary change', () => {
  it('is read at once', () => {
    const governor = make()
    governor.request()
    vi.advanceTimersByTime(0)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('is read once when a save announces itself three times', () => {
    const governor = make()
    governor.request()
    governor.request()
    governor.request()
    vi.advanceTimersByTime(5_000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reads again for a change that arrives after the read', () => {
    const governor = make()
    governor.request()
    vi.advanceTimersByTime(0)
    governor.request()
    vi.advanceTimersByTime(999)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})

describe('a loop, from any cause', () => {
  it('cannot cost a request a second', () => {
    const governor = make()
    // Every read causes another event, immediately, for ten minutes.
    refresh.mockImplementation(() => governor.request())
    governor.request()

    vi.advanceTimersByTime(10 * 60_000)

    // One a second would be 600. The gap doubles to thirty seconds and the
    // window only ever holds a few reads, so it settles far below that.
    expect(refresh.mock.calls.length).toBeLessThan(60)
  })

  it('says so, so development can see it by name', () => {
    const onPressure = vi.fn()
    const governor = createRefreshGovernor({ refresh, isHidden: () => false, onPressure })
    refresh.mockImplementation(() => governor.request())
    governor.request()
    vi.advanceTimersByTime(60_000)
    expect(onPressure).toHaveBeenCalled()
    expect(Math.max(...onPressure.mock.calls.map(([gap]) => gap))).toBeLessThanOrEqual(MAX_GAP_MS)
  })

  it('goes back to reading at once when things are quiet again', () => {
    const governor = make()
    let looping = true
    refresh.mockImplementation(() => {
      if (looping) governor.request()
    })
    governor.request()
    vi.advanceTimersByTime(2 * 60_000)
    looping = false
    vi.advanceTimersByTime(2 * 60_000)
    refresh.mockClear()

    governor.request()
    vi.advanceTimersByTime(0)

    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('a tab nobody is looking at', () => {
  it('asks the server for nothing, and reads once when it is looked at', () => {
    const governor = make()
    hidden = true
    for (let i = 0; i < 50; i++) governor.request()
    vi.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()

    hidden = false
    governor.visible()
    vi.advanceTimersByTime(0)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reads nothing on being looked at when nothing changed', () => {
    const governor = make()
    governor.visible()
    vi.advanceTimersByTime(5_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('a page that has gone', () => {
  it('never reads again', () => {
    const governor = make()
    governor.request()
    governor.dispose()
    vi.advanceTimersByTime(60_000)
    governor.request()
    vi.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()
    expect(governor.pending()).toBe(false)
  })
})

describe('a record that is honestly busy', () => {
  it('is never slowed: a colleague saving every twenty seconds is read at once each time', () => {
    const governor = make()
    const delays: number[] = []
    for (let i = 0; i < 30; i++) {
      const asked = Date.now()
      refresh.mockImplementationOnce(() => delays.push(Date.now() - asked))
      governor.request()
      vi.advanceTimersByTime(20_000)
    }
    expect(delays).toHaveLength(30)
    expect(Math.max(...delays)).toBe(0)
  })
})
