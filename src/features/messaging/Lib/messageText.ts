/**
 * Splits message text into the pieces a chat bubble renders differently.
 *
 * Messages arrive as plain text carrying two things a bubble should honour:
 * links, which people expect to click, and WhatsApp's own markers for bold,
 * italic and strikethrough, which senders use without thinking about it. Doing
 * the splitting here rather than in the component keeps it testable and keeps
 * the rendering free of any HTML built from text we did not write.
 */

export type MessageToken =
  | { type: 'text'; value: string; bold?: boolean; italic?: boolean; strike?: boolean }
  | { type: 'link'; value: string; href: string }

// Deliberately narrow: a scheme we trust, then anything but whitespace. The
// trailing punctuation trim below handles a link at the end of a sentence.
const LINK = /\bhttps?:\/\/[^\s<]+/gi

/** Punctuation that ends a sentence rather than the address inside it. */
const TRAILING = /[.,;:!?)\]}'"]+$/

/** One marker pair, applied only when it wraps something. */
const MARKERS: ReadonlyArray<{ char: string; key: 'bold' | 'italic' | 'strike' }> = [
  { char: '*', key: 'bold' },
  { char: '_', key: 'italic' },
  { char: '~', key: 'strike' },
]

function formatted(value: string): MessageToken[] {
  for (const { char, key } of MARKERS) {
    const pattern = new RegExp(`\\${char}([^\\s${'\\' + char}][^${'\\' + char}]*)\\${char}`)
    const match = pattern.exec(value)
    if (!match) continue

    const before = value.slice(0, match.index)
    const after = value.slice(match.index + match[0].length)
    return [
      ...(before ? formatted(before) : []),
      ...formatted(match[1]).map((token) =>
        token.type === 'text' ? { ...token, [key]: true } : token
      ),
      ...(after ? formatted(after) : []),
    ]
  }
  return value ? [{ type: 'text', value }] : []
}

export function tokenizeMessage(body: string): MessageToken[] {
  const tokens: MessageToken[] = []
  let cursor = 0

  LINK.lastIndex = 0
  let match = LINK.exec(body)
  while (match) {
    const raw = match[0]
    const href = raw.replace(TRAILING, '')
    const start = match.index

    if (start > cursor) tokens.push(...formatted(body.slice(cursor, start)))
    tokens.push({ type: 'link', value: href, href })

    // Punctuation trimmed off the address is still part of the sentence.
    const tail = raw.slice(href.length)
    if (tail) tokens.push(...formatted(tail))

    cursor = start + raw.length
    match = LINK.exec(body)
  }

  if (cursor < body.length) tokens.push(...formatted(body.slice(cursor)))
  return tokens
}
