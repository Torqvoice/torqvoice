/**
 * The header proxy.ts sets on page requests: the path and query the browser
 * asked for. Whatever a client sends under this name is overwritten there, and
 * readers still pass it through safeRedirectPath.
 */
export const REQUEST_PATH_HEADER = 'x-torqvoice-path'

/**
 * The path a page request asked for, without its query: what a layout or the
 * language resolver matches routes against. Null outside a page request.
 *
 * Read the header through this, never by a name of your own: the portal and
 * the share pages once looked for a header nothing set, so a workshop that
 * forced its language on customers got the visitor's instead.
 */
export function requestPathname(headerStore: { get(name: string): string | null }): string | null {
  const requested = headerStore.get(REQUEST_PATH_HEADER)
  if (!requested) return null
  return requested.split('?')[0] || null
}
