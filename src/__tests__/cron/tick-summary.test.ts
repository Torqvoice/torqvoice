import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTickSummary } from '@/lib/cron/tick-summary'

describe('createTickSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stays silent on per-tick work and prints one hourly total', () => {
    const summary = createTickSummary('Integration jobs processed')
    for (let i = 0; i < 59; i++) {
      summary.add(1)
      vi.advanceTimersByTime(60_000)
    }
    expect(console.warn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    summary.add(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      '[cron] Integration jobs processed: 60 in 60 run(s) over the last 60 min'
    )
  })

  it('ignores idle ticks and resets after a summary', () => {
    const summary = createTickSummary('Webhook deliveries processed')
    summary.add(0)
    summary.add(3)
    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    summary.add(2)
    expect(console.warn).toHaveBeenCalledWith(
      '[cron] Webhook deliveries processed: 5 in 2 run(s) over the last 120 min'
    )
    summary.add(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
