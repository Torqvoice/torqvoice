import { z } from 'zod'

/**
 * Rich text inside a block, as a small document tree rather than HTML.
 *
 * The designer edits with Tiptap, which speaks this shape natively, and the
 * renderers walk the tree and write the markup themselves. Nothing a person
 * typed is ever parsed as HTML, so there is nothing to sanitise, and the
 * plain-text half of the mail is the same tree read without its marks. Only
 * what a mail client can honour is in the vocabulary: paragraphs, lists,
 * line breaks, and the inline marks below.
 */

export type RichMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } }
  | { type: 'textStyle'; attrs: { color?: string | null; fontSize?: string | null } }

export type RichAlign = 'left' | 'center' | 'right'

export type RichNode =
  | { type: 'text'; text: string; marks?: RichMark[] }
  | { type: 'hardBreak' }
  | { type: 'paragraph'; attrs?: { textAlign?: RichAlign | null }; content?: RichNode[] }
  | { type: 'bulletList'; content?: RichNode[] }
  | { type: 'orderedList'; content?: RichNode[] }
  | { type: 'listItem'; content?: RichNode[] }

export interface RichDoc {
  type: 'doc'
  content?: RichNode[]
}

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)

/** The sizes the toolbar offers, as the CSS the text carries. */
export const RICH_FONT_SIZES = ['13px', '15px', '18px', '22px'] as const

export const richMarkSchema: z.ZodType<RichMark> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({ type: z.literal('strike') }),
  z.object({ type: z.literal('link'), attrs: z.object({ href: z.string().max(500) }) }),
  z.object({
    type: z.literal('textStyle'),
    attrs: z.object({
      color: hexColor.nullish(),
      fontSize: z.enum(RICH_FONT_SIZES).nullish(),
    }),
  }),
])

export const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      text: z.string().max(4000),
      marks: z.array(richMarkSchema).max(8).optional(),
    }),
    z.object({ type: z.literal('hardBreak') }),
    z.object({
      type: z.literal('paragraph'),
      attrs: z.object({ textAlign: z.enum(['left', 'center', 'right']).nullish() }).optional(),
      content: z.array(richNodeSchema).max(200).optional(),
    }),
    z.object({
      type: z.literal('bulletList'),
      content: z.array(richNodeSchema).max(50).optional(),
    }),
    z.object({
      type: z.literal('orderedList'),
      content: z.array(richNodeSchema).max(50).optional(),
    }),
    z.object({ type: z.literal('listItem'), content: z.array(richNodeSchema).max(20).optional() }),
  ])
)

export const richDocSchema: z.ZodType<RichDoc> = z.object({
  type: z.literal('doc'),
  content: z.array(richNodeSchema).max(100).optional(),
})

/** A plain string as a document: one paragraph per line break pair, breaks within. */
export function plainToRich(text: string): RichDoc {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => {
      const lines = paragraph.split('\n')
      const content: RichNode[] = []
      lines.forEach((line, index) => {
        if (index > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
      })
      return { type: 'paragraph', content }
    }),
  }
}

/** The words alone, the way the text part of the mail reads them. */
export function richToPlain(doc: RichDoc): string {
  const inline = (nodes: RichNode[] | undefined): string =>
    (nodes ?? [])
      .map((node) => {
        if (node.type === 'text') return node.text
        if (node.type === 'hardBreak') return '\n'
        return block(node)
      })
      .join('')

  const block = (node: RichNode): string => {
    switch (node.type) {
      case 'paragraph':
        return inline(node.content)
      case 'bulletList':
        return (node.content ?? []).map((item) => `- ${block(item)}`).join('\n')
      case 'orderedList':
        return (node.content ?? []).map((item, i) => `${i + 1}. ${block(item)}`).join('\n')
      case 'listItem':
        return (node.content ?? []).map(block).join('\n')
      default:
        return inline([node])
    }
  }

  return (doc.content ?? [])
    .map(block)
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/**
 * The same tree with every text node, and every link address, passed
 * through `fill`. A link whose address still holds a tag afterwards had no
 * value for it; the words stay and the link goes, the same rule as a button.
 */
export function mapRichText(doc: RichDoc, fill: (text: string) => string): RichDoc {
  const marks = (list: RichMark[] | undefined): RichMark[] | undefined => {
    if (!list) return list
    const out: RichMark[] = []
    for (const mark of list) {
      if (mark.type !== 'link') {
        out.push(mark)
        continue
      }
      const href = fill(mark.attrs.href).trim()
      if (href && !href.includes('{')) out.push({ type: 'link', attrs: { href } })
    }
    return out.length ? out : undefined
  }
  const walk = (node: RichNode): RichNode => {
    if (node.type === 'text') return { ...node, text: fill(node.text), marks: marks(node.marks) }
    if ('content' in node && node.content) return { ...node, content: node.content.map(walk) }
    return node
  }
  return { type: 'doc', content: doc.content?.map(walk) }
}

/** Every link address in the tree, for tag checks alongside the words. */
export function richHrefs(doc: RichDoc): string[] {
  const out: string[] = []
  const walk = (node: RichNode) => {
    if (node.type === 'text') {
      for (const mark of node.marks ?? []) if (mark.type === 'link') out.push(mark.attrs.href)
    } else if ('content' in node && node.content) {
      node.content.forEach(walk)
    }
  }
  doc.content?.forEach(walk)
  return out
}
