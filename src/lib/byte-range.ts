/**
 * Reads a `Range` request header against a file of a known size.
 *
 * A video player does not download a clip and then play it. It asks for the
 * first two bytes to learn whether the server can seek, then for the pieces
 * it needs, and iOS refuses to play at all from a server that answers a
 * range request with the whole file.
 *
 * Returns the inclusive byte span to send, `'unsatisfiable'` when the span
 * starts past the end of the file, and null when there is no range to honour:
 * no header, a unit other than bytes, a malformed value, or several ranges at
 * once, which nothing here asks for and which is answered with the whole file.
 */
export function parseByteRange(
  header: string | null,
  size: number
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null

  const [, from, to] = match
  if (from === '' && to === '') return null

  // `bytes=-500` is the last 500 bytes, not a span starting at zero.
  if (from === '') {
    const length = Number(to)
    if (length === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(size - length, 0), end: size - 1 }
  }

  const start = Number(from)
  if (start >= size) return 'unsatisfiable'

  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (end < start) return null

  return { start, end }
}
