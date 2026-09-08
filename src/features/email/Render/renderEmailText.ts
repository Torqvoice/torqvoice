import type { EmailSpec, SpecBlock } from '../Lib/buildEmailSpec'

/**
 * The same spec written out as plain text.
 *
 * Not an afterthought: a mail with no text part scores worse with spam
 * filters, and some people read mail as text on purpose. Generated from the
 * spec rather than written a second time, so the text half cannot say
 * something the HTML half does not.
 *
 * A button becomes its words followed by the address, because a reader of the
 * text part has nothing to click.
 */
function blockText(block: SpecBlock): string | null {
  switch (block.type) {
    case 'header':
      return block.workshopName || null

    case 'heading':
      return block.text

    case 'paragraph':
      return block.text

    case 'callout':
      return block.text

    case 'attachment_note':
      return block.text

    case 'button':
      return `${block.label}: ${block.href}`

    case 'document_summary':
      return block.rows.map((row) => `${row.label}: ${row.value}`).join('\n')

    case 'image':
      // A picture has no text half; its caption and its link are what a
      // text reader can still use.
      return block.href ? `${block.alt || block.href}: ${block.href}` : block.alt || null

    case 'divider':
      return '---'

    case 'spacer':
      return null

    case 'contact_footer':
      return block.lines.join('\n')

    default:
      return null
  }
}

export function renderEmailText(spec: EmailSpec): string {
  return spec.blocks
    .map(blockText)
    .filter((part): part is string => !!part)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
