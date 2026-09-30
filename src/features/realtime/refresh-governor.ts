/**
 * Decides when a page may read its record again.
 *
 * A live event is answered with a request, and that is the one place this
 * layer can cost the server something: a request that causes an event that
 * causes a request is a page polling for ever, and it looks like a feature
 * working. So the rule is not in the hook that happens to be written
 * carefully; it is here, and every live re-read goes through it.
 *
 * - **One at a time, a second apart.** A save writes a job, its lines and its
 *   totals; that is one re-read, not three.
 * - **Not while nobody is looking.** A hidden tab remembers that something
 *   changed and reads once when it is looked at again.
 * - **It recognises its own echo.** A change that arrives just after a re-read,
 *   time after time, is the re-read causing it. After a few of those in a row
 *   the gap doubles each time, up to thirty seconds, so a loop from any cause
 *   costs two requests a minute and not sixty. An honest busy record is not
 *   slowed at all: a colleague saving every twenty seconds is never an echo,
 *   and the streak ends with the first re-read that nothing follows.
 */

export interface GovernorOptions {
  refresh: () => void
  isHidden?: () => boolean
  now?: () => number
  /** Told when the gap has grown, so development can see a loop by name. */
  onPressure?: (gapMs: number) => void
}

export const MIN_GAP_MS = 1_000
export const MAX_GAP_MS = 30_000
/** A change this soon after a re-read may have been caused by it. */
export const ECHO_MS = 3_000
/** Echoes in a row that are allowed to be coincidence: a save in three writes. */
export const FREE_ECHOES = 3

export interface RefreshGovernor {
  /** Something changed: read again, when it is allowed. */
  request(): void
  /** The tab was looked at again. */
  visible(): void
  dispose(): void
  /** For tests. */
  pending(): boolean
}

export function createRefreshGovernor(options: GovernorOptions): RefreshGovernor {
  const now = options.now ?? Date.now
  const isHidden =
    options.isHidden ??
    (() => typeof document !== 'undefined' && document.visibilityState === 'hidden')

  let timer: ReturnType<typeof setTimeout> | null = null
  let missedWhileHidden = false
  let disposed = false
  let lastRefresh: number | null = null
  /** Re-reads in a row that were each followed at once by another change. */
  let streak = 0
  let echoed = false

  const gap = (): number =>
    streak < FREE_ECHOES
      ? MIN_GAP_MS
      : Math.min(MAX_GAP_MS, MIN_GAP_MS * 2 ** (streak - FREE_ECHOES + 1))

  const run = () => {
    timer = null
    if (disposed) return
    if (isHidden()) {
      missedWhileHidden = true
      return
    }
    streak = echoed ? streak + 1 : 0
    echoed = false
    lastRefresh = now()
    options.refresh()
  }

  const request = () => {
    if (disposed) return
    const at = now()
    if (lastRefresh !== null && at - lastRefresh <= ECHO_MS) echoed = true
    if (timer) return
    if (isHidden()) {
      missedWhileHidden = true
      return
    }
    const wait = gap()
    if (wait > MIN_GAP_MS) options.onPressure?.(wait)
    const delay = lastRefresh === null ? 0 : Math.max(0, lastRefresh + wait - at)
    timer = setTimeout(run, delay)
  }

  return {
    request,
    visible() {
      if (!missedWhileHidden) return
      missedWhileHidden = false
      request()
    },
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      missedWhileHidden = false
    },
    pending: () => timer !== null || missedWhileHidden,
  }
}
