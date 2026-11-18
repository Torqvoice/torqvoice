/**
 * A rich-text field as plain text, for a system that shows text as it is: a
 * ledger line, a memo. The editor stores HTML, so each paragraph becomes a
 * line, an empty paragraph a blank line, a list item starts with "- " or its
 * number, and entities turn back into the characters they stand for. Notes
 * saved without markup (a recurring invoice, an import) pass through with
 * their line breaks.
 */

/** Tags that start and end a line of their own. */
const BLOCKS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'pre',
  'tr',
])

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * What ends a tag's name. A word boundary is not enough: it also sits before
 * the @ of "<accounts@example.com>", which is an address someone typed.
 */
const NAME_END = '(?=[\\s/>])'

/** Something a browser would lay out, where a line break in the source is only a space. */
const MARKUP = new RegExp(`<(p|div|br|ul|ol|li|h[1-6]|blockquote|pre|table)${NAME_END}`, 'i')

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
    const hex = name[1] === 'x' || name[1] === 'X'
    const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10)
    // A non-breaking space is a space to whoever reads the line.
    if (code === 0xa0) return ' '
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

export function richTextToPlain(value: string | null | undefined): string {
  if (!value) return ''
  const html = value.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  const laidOut = MARKUP.test(html)
  const lists: { ordered: boolean; count: number }[] = []
  let out = ''
  /** Where the open block's own text starts, to tell an empty one. */
  let blockStart = -1
  let last = 0
  const text = (chunk: string) => {
    if (!laidOut) {
      out += chunk
      return
    }
    const flat = chunk.replace(/\s+/g, ' ')
    // Space between two blocks in the source is not text.
    const lineStart = !out || out.endsWith('\n') || out.length === blockStart
    out += lineStart ? flat.trimStart() : flat
  }
  const breakLine = () => {
    if (out && !out.endsWith('\n')) out += '\n'
  }

  // Only what looks like a tag is taken out: "pads < 3 mm" is text.
  for (const m of html.matchAll(new RegExp(`<(/?)([a-z][a-z0-9]*)${NAME_END}[^>]*>`, 'gi'))) {
    text(html.slice(last, m.index))
    last = m.index + m[0].length
    const closing = m[1] === '/'
    const name = m[2].toLowerCase()

    if (name === 'br' || name === 'hr') {
      out += '\n'
    } else if (name === 'ul' || name === 'ol') {
      if (closing) lists.pop()
      else {
        // A numbered list carries on from where the writer started it.
        const start = /\sstart\s*=\s*["']?(\d+)/i.exec(m[0])
        lists.push({ ordered: name === 'ol', count: start ? Number(start[1]) - 1 : 0 })
      }
    } else if (BLOCKS.has(name)) {
      if (closing) {
        // An empty paragraph is the blank line the writer left.
        if (name === 'p' && out.length === blockStart) out += '\n'
        else breakLine()
        blockStart = -1
      } else {
        // A paragraph that opens a list item stays on the item's line.
        if (out.length !== blockStart) breakLine()
        if (name === 'li') {
          const list = lists[lists.length - 1]
          const indent = '  '.repeat(Math.max(0, lists.length - 1))
          out += list?.ordered ? `${indent}${++list.count}. ` : `${indent}- `
        }
        blockStart = out.length
      }
    }
  }
  text(html.slice(last))

  return decodeEntities(out)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
