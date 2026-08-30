/**
 * Where the technician app lives.
 *
 * One constant rather than a URL typed into each screen that offers it: the
 * desk's handoff dialog, the page a scanned QR lands on, and the docs all
 * point at the same listing, and a store link that has drifted in one of them
 * is a technician who cannot install the app.
 */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.torqvoice.technician'

/** The Android package, which is also what a deep link resolves against. */
export const ANDROID_PACKAGE = 'com.torqvoice.technician'
