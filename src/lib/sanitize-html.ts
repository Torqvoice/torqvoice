const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
])

/**
 * Strips all HTML tags and attributes except those produced by Tiptap.
 * Allowed tags are kept but all attributes are removed.
 * Any other tag is removed, keeping its inner text content.
 *
 * A `<` that does not open a tag is escaped rather than left alone. The
 * editor never writes one (it stores `&lt;`), so the only input that has
 * them is input built to leave something behind once a tag is taken out of
 * the middle of it. With this, every `<` in the result is one written here.
 */
export function sanitizeHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>|</g, (match, tag?: string) => {
    if (!tag) return '&lt;'
    const lower = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(lower)) return ''
    // Self-closing tags
    if (lower === 'br') return '<br>'
    // Strip all attributes, keep only the tag
    if (match.startsWith('</')) return `</${lower}>`
    return `<${lower}>`
  })
}
