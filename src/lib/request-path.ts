/**
 * The header proxy.ts sets on page requests: the path and query the browser
 * asked for. Whatever a client sends under this name is overwritten there, and
 * readers still pass it through safeRedirectPath.
 */
export const REQUEST_PATH_HEADER = 'x-torqvoice-path'
