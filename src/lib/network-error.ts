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
  // By what it is, not by which window made it: an error thrown in another
  // frame or realm is an instance of neither this window's TypeError nor its
  // Error, but it still says what it is.
  if (Object.prototype.toString.call(error) !== '[object Error]') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name !== 'TypeError' || typeof message !== 'string') return false
  return NETWORK_ERROR_MESSAGES.some((pattern) => pattern.test(message))
}
