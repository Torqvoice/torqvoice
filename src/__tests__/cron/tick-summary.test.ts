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

  it('sends the total when the hour is up even if the last ticks were idle', () => {
    const summary = createTickSummary('Scheduled messages sent')
    summary.add(4)
    vi.advanceTimersByTime(60 * 60 * 1000)
    summary.add(0)
    expect(console.warn).toHaveBeenCalledWith(
      '[cron] Scheduled messages sent: 4 in 1 run(s) over the last 60 min'
    )
  })

  it('says each run at LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug'
    try {
      createTickSummary('Webhook deliveries processed').add(3)
      expect(console.warn).toHaveBeenCalledWith(
        '[cron] Webhook deliveries processed this run count=3'
      )
    } finally {
      delete process.env.LOG_LEVEL
    }
  })
})
