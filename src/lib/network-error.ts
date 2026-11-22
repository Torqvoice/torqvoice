/**
 * What each browser's fetch throws when the connection is gone: offline, a
 * dropped connection, a network change, or a response cut off halfway.
 * Chrome, Firefox and Safari (old and new) word it differently. Matched
 * whole, so an application error that merely mentions the network still
 * shows as the error it is.
 */
const NETWORK_ERROR_MESSAGES = [
  // Chrome and Edge, for a request that never got an answer. Newer Chrome
  // may add the host in brackets
  /^Failed to fetch( \(.+\))?$/,
  // Chrome and Edge, for a response whose body stopped arriving midway
  /^network error$/,
  // Firefox
  /^NetworkError when attempting to fetch resource\.?$/,
  // Safari
  /^Load failed$/,
  /^The network connection was lost\.?$/,
  /^The Internet connection appears to be offline\.?$/,
]

/**
 * Whether an error means the browser lost its connection to the server,
 * rather than that something in the app broke. Shared by the connection
 * notice and the error pages, so both draw the line in the same place.
 */
export function isNetworkError(error: unknown): boolean {
  // The name as well as the class: an error from another frame or realm is
  // not an instance of this window's TypeError
  if (!(error instanceof TypeError) && !(error instanceof Error && error.name === 'TypeError')) {
    return false
  }
  return NETWORK_ERROR_MESSAGES.some((pattern) => pattern.test(error.message))
}
