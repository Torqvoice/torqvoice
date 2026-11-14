const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'a',
])

/** Elements whose text is not prose and must go with the tag. */
const DROPPED_WITH_CONTENT = /<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** An absolute web link, or a path inside this app. Anything else is dropped. */
function safeHref(tag: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
  const raw = (match?.[1] ?? match?.[2] ?? '').replace(/&amp;/g, '&').trim()
  if (!raw) return null
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * The body of a highlight, reduced to what the admin's editor can produce.
 *
 * torqvoice.com sanitizes on save; this runs again here because the text
 * crossed the network and is about to be set as HTML inside a signed-in
 * workshop. Every attribute goes except a link's address, and that has to be
 * a web address or an app path.
 */
export function sanitizeBody(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(DROPPED_WITH_CONTENT, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) => {
      const name = tag.toLowerCase()
      if (!ALLOWED_TAGS.has(name)) return ''
      if (name === 'br') return '<br>'
      if (match.startsWith('</')) return `</${name}>`
      if (name !== 'a') return `<${name}>`
      const href = safeHref(match)
      if (!href) return '<a>'
      const external = !href.startsWith('/')
      return `<a href="${escapeAttribute(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>`
    })
}
