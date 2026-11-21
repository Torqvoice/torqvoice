import type { Block, BoxStyle, DocumentSpec, Node, TextStyle } from '../Spec/documentSpec'
import { BLOCK_GAP, marginOf } from '../Render/layoutEngine'
import { DEFAULT_LINE_HEIGHT, lineCount, longByLength, textHeight } from './measure'

/**
 * How tall each block will print, computed from the spec alone.
 *
 * The designer asks the browser; the PDF renderer runs where there is no
 * browser, so it walks the same node tree the renderers draw and adds up the
 * same paddings, gaps and wrapped lines using the embedded fonts' own
 * metrics. Estimates feed the layout engine, whose output spaces the flow —
 * a few points of error shift things slightly, never clip them, because the
 * PDF still lets every block be as tall as its content.
 */

export interface Inherited {
  fontFamily?: string
  fontSize: number
  lineHeight?: number
}

function pad(style?: BoxStyle) {
  if (!style?.padding) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof style.padding === 'number') {
    const p = style.padding
    return { top: p, right: p, bottom: p, left: p }
  }
  return style.padding
}

function merge(inherited: Inherited, style?: TextStyle): TextStyle {
  return {
    fontFamily: style?.fontFamily ?? inherited.fontFamily,
    fontSize: style?.fontSize ?? inherited.fontSize,
    lineHeight: style?.lineHeight ?? inherited.lineHeight,
    bold: style?.bold,
    uppercase: style?.uppercase,
    letterSpacing: style?.letterSpacing,
  }
}

/** Strip a rich-text fragment to the text that will occupy lines. */
export function plainTextOf(html: string): { text: string; paragraphs: number } {
  const paragraphs = (html.match(/<(p|li|h2|h3)\b/gi) ?? []).length
  const text = html
    .replace(/<(br|\/p|\/li|\/h2|\/h3)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return { text: text.replace(/\n{2,}/g, '\n').trim(), paragraphs: Math.max(1, paragraphs) }
}

/** One node's printed height at a width; exported for the tests that print it to compare. */
export function nodeHeight(node: Node, width: number, inherited: Inherited): number {
  switch (node.kind) {
    case 'text': {
      if (!node.text) return 0
      const style = merge(inherited, node.style)
      return textHeight(node.text, width, style, inherited.fontSize)
    }

    case 'richtext': {
      const { text, paragraphs } = plainTextOf(node.html)
      if (!text) return 0
      const style = merge(inherited, { lineHeight: 1.5, ...node.style })
      return textHeight(text, width, style, inherited.fontSize) + paragraphs * 3
    }

    case 'spacer':
      return node.height

    case 'image':
      return node.maxHeight

    case 'drawing':
      return width > 0 && width < node.width ? (node.height * width) / node.width : node.height

    case 'stack': {
      const p = pad(node.style)
      const inner = width - p.left - p.right
      const gap = node.gap ?? 0
      const heights = node.children.map((child) => nodeHeight(child, inner, inherited))
      const visible = heights.filter((h) => h > 0)
      const sum = visible.reduce((total, h) => total + h, 0)
      return p.top + sum + gap * Math.max(0, visible.length - 1) + p.bottom
    }

    case 'row': {
      const p = pad(node.style)
      const inner = width - p.left - p.right
      const gap = (node.gap ?? 0) * Math.max(0, node.children.length - 1)
      const fixed = node.children.reduce(
        (total, child) => total + (typeof child.width === 'number' ? child.width : 0),
        0
      )
      const flexCount = node.children.filter((child) => child.width === 'flex').length
      const flexWidth = flexCount > 0 ? Math.max(0, (inner - fixed - gap) / flexCount) : 0
      const tallest = node.children.reduce((max, child) => {
        const childWidth =
          typeof child.width === 'number'
            ? child.width
            : child.width === 'flex'
              ? flexWidth
              : // Auto-width children shrink to their content; for height they
                // behave like the room that is left.
                Math.max(0, inner - fixed - gap)
        return Math.max(max, nodeHeight(child.node, childWidth, inherited))
      }, 0)
      return p.top + tallest + p.bottom
    }

    case 'table': {
      // Measured the way renderPdf.tsx draws it: the same widths, the same
      // faces (a group heading and an emphasised row are bold) and, with
      // breakLongWords, the same test of which words break inside themselves.
      const headerSize = node.headerStyle?.fontSize ?? inherited.fontSize
      const rowPadding = node.rowPadding ?? 5
      const inner = width - 16
      const gap = 0
      const fixed = node.columns.reduce(
        (total, column) => total + (typeof column.width === 'number' ? column.width : 0),
        0
      )
      const flexCount = node.columns.filter((column) => column.width === 'flex').length
      const flexWidth = flexCount > 0 ? Math.max(20, (inner - fixed - gap) / flexCount) : 0
      const cellStyle = merge(inherited, undefined)
      const boldStyle = merge(inherited, { bold: true })
      const lastColumn = node.columns[node.columns.length - 1]
      // A column gap is padding inside every cell but the last, so it comes
      // off the room the text has, not off the table.
      const roomOf = (column: (typeof node.columns)[number]) =>
        (column.width === 'flex' ? flexWidth : column.width) -
        (column === lastColumn ? 0 : (node.columnGap ?? 0))
      // A fixed column breaks a word wider than itself, a shared one a word
      // longer than LONG_WORD characters, as the PDF does.
      const breaks = (column: (typeof node.columns)[number]) =>
        node.breakLongWords ? (column.width === 'flex' ? longByLength : true) : false

      // A heading wraps in its column with breakLongWords; without, it is one line.
      let headerLines = 1
      if (node.breakLongWords) {
        const headerStyle = merge(inherited, node.headerStyle)
        for (const column of node.columns) {
          headerLines = Math.max(
            headerLines,
            lineCount(column.label, roomOf(column), headerStyle, headerSize, breaks(column))
          )
        }
      }
      const headerHeight =
        headerLines * headerSize * DEFAULT_LINE_HEIGHT + (node.headerPadding ?? 6) * 2

      const lineHeight = inherited.fontSize * DEFAULT_LINE_HEIGHT
      const subSize = inherited.fontSize * 0.85
      const subStyle = merge(inherited, { fontSize: subSize })
      let body = 0
      for (const row of node.rows) {
        // A group heading is one run of bold text across the whole row.
        const heading = node.groupKey ? row[node.groupKey] : undefined
        let rowHeight = heading
          ? lineCount(heading, inner, boldStyle, inherited.fontSize) * lineHeight
          : lineHeight
        const style = node.emphasisKey && row[node.emphasisKey] ? boldStyle : cellStyle
        const sub = node.subKey ? row[node.subKey] : undefined
        for (const column of heading ? [] : node.columns) {
          const value = row[column.key]
          // lineCount and not width-over-width: a part described over three
          // lines is three lines however narrow each one is, and dividing the
          // whole run by the column width counted it as one. The table then
          // measured shorter than it prints, and whatever the engine placed
          // after it landed on top of the last rows.
          let cell = value
            ? lineCount(value, roomOf(column), style, inherited.fontSize, breaks(column)) *
              lineHeight
            : 0
          // The smaller line under the text of every shared column.
          if (sub && column.width === 'flex') {
            cell +=
              lineCount(sub, roomOf(column), subStyle, subSize) * subSize * DEFAULT_LINE_HEIGHT
          }
          rowHeight = Math.max(rowHeight, cell)
        }
        body += rowHeight + rowPadding * 2 + (node.ruleWidth ?? 0.75)
      }
      const outer = typeof node.style?.borderWidth === 'number' ? node.style.borderWidth * 2 : 0
      return headerHeight + body + outer
    }

    default:
      return 0
  }
}

/** Every block's printed height, keyed by id, at the widths the layout uses. */
export function estimateBlockHeights(spec: DocumentSpec): Map<string, number> {
  const contentWidth = spec.page.width - spec.page.margin.left - spec.page.margin.right
  const colWidth = (contentWidth - BLOCK_GAP) / 2

  const widthFor = (block: Block) => {
    if (block.placement.mode === 'anchored') return block.placement.anchor.width ?? contentWidth
    if (block.placement.mode === 'pinned') return contentWidth
    const m = marginOf(block)
    const lane = block.placement.mode === 'flow' && block.placement.column
    return (lane ? colWidth : contentWidth) - m.left - m.right
  }

  const heights = new Map<string, number>()
  for (const block of spec.blocks) {
    const inherited: Inherited = {
      fontFamily: block.text?.fontFamily ?? spec.page.fontFamily,
      fontSize: block.text?.fontSize ?? spec.page.fontSize,
    }
    heights.set(block.id, nodeHeight(block.content, widthFor(block), inherited))
  }
  return heights
}
