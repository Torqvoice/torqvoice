/**
 * Every-minute crons used to print one line per tick that did work, which on
 * a busy install is a line a minute of "processed: 1". Routine work is already
 * recorded per item (integration logs, delivery rows), so the console only
 * needs an hourly total. Failures and recoveries still log immediately.
 */
const SUMMARY_MS = 60 * 60 * 1000

export function createTickSummary(label: string, intervalMs = SUMMARY_MS) {
  let total = 0
  let ticks = 0
  let since = Date.now()
  return {
    add(count: number) {
      if (count <= 0) return
      total += count
      ticks++
      if (Date.now() - since < intervalMs) return
      const minutes = Math.round((Date.now() - since) / 60_000)
      console.warn(`[cron] ${label}: ${total} in ${ticks} run(s) over the last ${minutes} min`)
      total = 0
      ticks = 0
      since = Date.now()
    },
  }
}
