/**
 * The oldest technician app build this server will work with.
 *
 * Raised only when an API change actually breaks older clients. Every raise
 * strands anyone who has not updated, so it is a deliberate act, not
 * housekeeping to do alongside a release.
 */
export const MIN_APP_VERSION = '1.0.0'
