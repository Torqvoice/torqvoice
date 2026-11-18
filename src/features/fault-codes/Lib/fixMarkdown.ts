/**
 * A fix is stored as plain Markdown: paragraphs, bold, italic, lists and
 * quotes. Plain text reads fine where nothing renders it (the review page,
 * an API client), and the app shows it formatted (`FixText`). This turns the
 * share dialog's editor HTML into that Markdown; anything else the editor
 * can make (underline, links, headings) keeps its text.
 */
export function htmlToFixMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return Array.from(doc.body.childNodes)
    .map((n) => block(n))
    .filter((b) => b.trim() !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_`])/g, '\\$1')
}

/** Puts a mark round the text, outside its own leading and trailing spaces. */
function wrap(text: string, mark: string): string {
  const core = text.trim()
  if (!core) return text
  const lead = text.slice(0, text.indexOf(core))
  const trail = text.slice(text.indexOf(core) + core.length)
  return `${lead}${mark}${core}${mark}${trail}`
}

function inline(node: Node): string {
  if (node.nodeType === 3) return escapeMarkdown(node.textContent ?? '')
  if (node.nodeType !== 1) return ''
  const el = node as Element
  const inner = Array.from(el.childNodes).map(inline).join('')
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return wrap(inner, '**')
    case 'EM':
    case 'I':
      return wrap(inner, '*')
    case 'BR':
      // A hard line break in CommonMark.
      return '\\\n'
    default:
      return inner
  }
}

function block(node: Node, indent = ''): string {
  if (node.nodeType !== 1) return inline(node).trim()
  const el = node as Element
  switch (el.tagName) {
    case 'P':
      return inline(el).trim()
    case 'H1':
    case 'H2':
    case 'H3':
      return wrap(inline(el).trim(), '**')
    case 'UL':
    case 'OL':
      return list(el, indent)
    case 'BLOCKQUOTE':
      return Array.from(el.childNodes)
        .map((c) => block(c))
        .filter((b) => b.trim() !== '')
        .join('\n\n')
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
    default:
      return inline(el).trim()
  }
}

function list(el: Element, indent: string): string {
  const ordered = el.tagName === 'OL'
  return Array.from(el.children)
    .filter((li) => li.tagName === 'LI')
    .map((li, i) => {
      const marker = ordered ? `${i + 1}. ` : '- '
      let text = ''
      const nested: string[] = []
      for (const c of Array.from(li.childNodes)) {
        const tag = c.nodeType === 1 ? (c as Element).tagName : ''
        if (tag === 'UL' || tag === 'OL') nested.push(list(c as Element, `${indent}   `))
        else if (tag === 'P') text += (text ? ' ' : '') + inline(c).trim()
        else text += inline(c)
      }
      return [`${indent}${marker}${text.trim()}`, ...nested].join('\n')
    })
    .join('\n')
}
