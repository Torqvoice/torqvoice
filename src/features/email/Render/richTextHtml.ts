import type { RichDoc, RichMark, RichNode } from '../Lib/richText'
import { safeHref } from '../Lib/links'
import { escapeHtml } from './escape'

/**
 * A rich text tree as the inline-styled markup a mail client will honour.
 *
 * Every rule is written on the element: no classes, no stylesheet, and only
 * the properties Outlook's renderer understands. Paragraph spacing is done
 * with margins on the <p>, which every client keeps; lists are real lists,
 * which every client draws. The last block carries no bottom margin, since
 * the row it sits in has padding of its own.
 */

export interface RichTextStyle {
  /** The font stack, colour and size the block would have had as plain text. */
  font: string
  color: string
  fontSize: number
  lineHeight: number
  /** Links take the theme's primary colour. */
  linkColor: string
  /** Room under a paragraph that another follows, in pixels. Absent is 10. */
  paragraphGap?: number
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function markText(text: string, marks: RichMark[] | undefined, style: RichTextStyle): string {
  let out = escapeHtml(text)
  const inline: string[] = []
  let href: string | null = null

  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        inline.push('font-weight:700')
        break
      case 'italic':
        inline.push('font-style:italic')
        break
      case 'underline':
        inline.push('text-decoration:underline')
        break
      case 'strike':
        inline.push('text-decoration:line-through')
        break
      case 'link':
        href = safeHref(mark.attrs.href)
        break
      case 'textStyle':
        if (mark.attrs.color && HEX_COLOR.test(mark.attrs.color)) {
          inline.push(`color:${mark.attrs.color}`)
        }
        if (mark.attrs.fontSize && /^\d{1,2}px$/.test(mark.attrs.fontSize)) {
          inline.push(`font-size:${mark.attrs.fontSize}`)
        }
        break
    }
  }

  if (inline.length) out = `<span style="${inline.join(';')};">${out}</span>`
  if (href) {
    out = `<a href="${escapeHtml(href)}" style="color:${style.linkColor};text-decoration:underline;">${out}</a>`
  }
  return out
}

function inlineHtml(nodes: RichNode[] | undefined, style: RichTextStyle): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') return markText(node.text, node.marks, style)
      if (node.type === 'hardBreak') return '<br />'
      return blockHtml(node, style, false)
    })
    .join('')
}

function blockHtml(node: RichNode, style: RichTextStyle, last: boolean): string {
  const base = `font-family:${style.font};font-size:${style.fontSize}px;line-height:${style.lineHeight};color:${style.color};`
  const margin = last ? 'margin:0;' : `margin:0 0 ${style.paragraphGap ?? 10}px 0;`
  switch (node.type) {
    case 'paragraph': {
      const align = node.attrs?.textAlign
      const alignCss = align && align !== 'left' ? `text-align:${align};` : ''
      const inner = inlineHtml(node.content, style)
      // An empty paragraph is a blank line the writer meant.
      return `<p style="${base}${alignCss}${margin}">${inner || '&nbsp;'}</p>`
    }
    case 'bulletList':
    case 'orderedList': {
      const tag = node.type === 'bulletList' ? 'ul' : 'ol'
      const items = (node.content ?? []).map((item) => blockHtml(item, style, false)).join('')
      return `<${tag} style="${base}${margin}padding:0 0 0 22px;">${items}</${tag}>`
    }
    case 'listItem': {
      // A list item's paragraphs lose their own margin; the list has one.
      const inner = (node.content ?? [])
        .map((child) =>
          child.type === 'paragraph'
            ? inlineHtml(child.content, style)
            : blockHtml(child, style, true)
        )
        .join('<br />')
      return `<li style="${base}margin:0 0 4px 0;">${inner}</li>`
    }
    default:
      return inlineHtml([node], style)
  }
}

export function richToHtml(doc: RichDoc, style: RichTextStyle): string {
  const nodes = doc.content ?? []
  return nodes.map((node, index) => blockHtml(node, style, index === nodes.length - 1)).join('')
}
