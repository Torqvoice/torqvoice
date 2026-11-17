import { createLogger } from '@/lib/logger'

/**
 * Every-minute crons used to print one line per tick that did work, which on
 * a busy install is a line a minute of "processed: 1". Routine work is already
 * recorded per item (integration logs, delivery rows), so the console only
 * needs an hourly total, at `info`; each tick's count is `debug`. Failures
 * and recoveries still log immediately.
 *
 * Call `add` on every tick, idle ones too, so the total goes out when the
 * hour is up rather than at the next tick that happens to do work.
 */
const SUMMARY_MS = 60 * 60 * 1000

export function createTickSummary(label: string, intervalMs = SUMMARY_MS) {
  const log = createLogger('cron')
  let total = 0
  let ticks = 0
  let since = Date.now()
  return {
    add(count: number) {
      if (count > 0) {
        total += count
        ticks++
        log.debug(`${label} this run`, { count })
      }
      if (Date.now() - since < intervalMs) return
      if (total > 0) {
        const minutes = Math.round((Date.now() - since) / 60_000)
        log.info(`${label}: ${total} in ${ticks} run(s) over the last ${minutes} min`)
      }
      total = 0
      ticks = 0
      since = Date.now()
    },
  }
}
