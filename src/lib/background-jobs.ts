/**
 * Whether the scheduled work instrumentation.ts starts is still running, for
 * the health check. Kept on globalThis because instrumentation and the route
 * handlers are bundled apart and can each load their own copy of this module;
 * the process is the one thing they share.
 */
type BackgroundJobsState = { disabled: true } | { disabled: false; lastBeatAt: number }

const store = globalThis as unknown as { __torqvoiceBackgroundJobs?: BackgroundJobsState }

/** `DISABLE_BACKGROUND_JOBS=1`: nothing was meant to start. */
export function markBackgroundJobsDisabled() {
  store.__torqvoiceBackgroundJobs = { disabled: true }
}

/** The scheduler fired. Called once at start and then every minute. */
export function recordBackgroundJobsBeat(now = Date.now()) {
  store.__torqvoiceBackgroundJobs = { disabled: false, lastBeatAt: now }
}

/** Undefined until instrumentation has run to the end. */
export function backgroundJobsState(): BackgroundJobsState | undefined {
  return store.__torqvoiceBackgroundJobs
}
