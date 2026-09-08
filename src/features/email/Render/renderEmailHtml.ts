import type { EmailSpec, SpecBlock, SpecText } from '../Lib/buildEmailSpec'
import {
  DEFAULT_EMAIL_THEME,
  EMAIL_FONTS,
  EMAIL_LOGO_MAX_WIDTH,
  EMAIL_LOGO_MIN_WIDTH,
  type EmailTheme,
} from '../Lib/emailTemplate'
import { safeHref } from '../Lib/links'
import { escapeHtml } from './escape'
import { richToHtml } from './richTextHtml'

export { escapeHtml }

/**
 * A spec drawn as HTML a mail client will actually render.
 *
 * Email is not the web. Outlook renders through Word, Gmail strips <style>
 * from some clients, and nothing can be relied on beyond tables and inline
 * styles. So: a table for the outer frame, a table for the content, every
 * rule written on the element it applies to, a 600px column, no external
 * stylesheet, no web font, no flexbox, no grid, no position.
 *
 * The workshop never types HTML, so nothing here has to survive a paste from
 * Word. Every string that came from a person is escaped on the way in, and
 * the theme is checked again here even though the schema already did: this
 * file is the last thing between a stored row and somebody's inbox.
 */

const WIDTH = 600

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** A colour that is a colour, or the default; never anything that could close an attribute. */
function color(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback
}

/** The theme with every value known to be safe inside an attribute. */
function safeTheme(theme: EmailTheme) {
  const d = DEFAULT_EMAIL_THEME
  const radius = Number.isFinite(theme.buttonRadius)
    ? Math.min(32, Math.max(0, Math.round(theme.buttonRadius)))
    : d.buttonRadius
  return {
    primary: color(theme.primaryColor, d.primaryColor),
    text: color(theme.textColor, d.textColor),
    muted: color(theme.mutedColor, d.mutedColor),
    background: color(theme.backgroundColor, d.backgroundColor),
    panel: color(theme.panelColor, d.panelColor),
    font: EMAIL_FONTS[theme.fontFamily] ?? EMAIL_FONTS[d.fontFamily],
    radius,
  }
}

type SafeTheme = ReturnType<typeof safeTheme>

/** Line breaks the workshop typed, as breaks rather than as spaces. */
function paragraphHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br />')
}

/**
 * A text block's words as markup: the rich tree when there is one, else the
 * plain string with its line breaks. The style is what the block would have
 * looked like anyway, so plain and rich text sit on the same baseline.
 */
function wordsHtml(
  words: SpecText,
  t: SafeTheme,
  look: { color: string; fontSize: number; lineHeight: number }
): string {
  if (!words.rich) return paragraphHtml(words.text)
  return richToHtml(words.rich, { font: t.font, linkColor: t.primary, ...look })
}

function blockHtml(block: SpecBlock, t: SafeTheme, marked: boolean): string {
  const base = `font-family:${t.font};`
  const row = (cell: string) => tableRow(cell, marked ? block.id : undefined)

  switch (block.type) {
    case 'header': {
      const width = Math.min(
        EMAIL_LOGO_MAX_WIDTH,
        Math.max(EMAIL_LOGO_MIN_WIDTH, Math.round(block.logoWidth || 140))
      )
      const logo = block.logoUrl
        ? `<img src="${escapeHtml(block.logoUrl)}" alt="${escapeHtml(block.workshopName)}" width="${width}" style="display:inline-block;border:0;max-width:${width}px;height:auto;vertical-align:middle;" />`
        : block.workshopName
          ? `<span style="${base}font-size:20px;font-weight:700;color:${t.text};">${escapeHtml(block.workshopName)}</span>`
          : ''
      if (!logo) return ''
      // The td's align attribute is what Outlook reads; the style is for
      // everyone else. The image is inline so the alignment applies to it.
      return row(
        `<td align="${block.align}" style="padding:0 0 20px 0;text-align:${block.align};">${logo}</td>`
      )
    }

    case 'heading':
      return row(
        `<td style="${base}font-size:20px;font-weight:700;color:${t.text};padding:0 0 12px 0;">${wordsHtml(block, t, { color: t.text, fontSize: 20, lineHeight: 1.3 })}</td>`
      )

    case 'paragraph':
      return row(
        `<td style="${base}font-size:15px;line-height:1.5;color:${t.text};padding:0 0 14px 0;">${wordsHtml(block, t, { color: t.text, fontSize: 15, lineHeight: 1.5 })}</td>`
      )

    case 'callout':
      return row(
        `<td style="padding:0 0 18px 0;">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${t.panel};border-left:4px solid ${t.primary};border-radius:4px;">` +
          `<tr><td style="${base}font-size:15px;line-height:1.5;color:${t.text};padding:14px 16px;">${wordsHtml(block, t, { color: t.text, fontSize: 15, lineHeight: 1.5 })}</td></tr>` +
          `</table></td>`
      )

    case 'button': {
      const href = safeHref(block.href)
      if (!href) return ''
      // A table around the anchor, because Outlook ignores padding on one.
      const side = block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : 'left'
      return row(
        `<td align="${side}" style="padding:6px 0 20px 0;text-align:${side};">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${side}" style="display:inline-table;"><tr>` +
          `<td align="center" bgcolor="${t.primary}" style="border-radius:${t.radius}px;">` +
          `<a href="${escapeHtml(href)}" style="${base}display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:${t.radius}px;">${escapeHtml(block.label)}</a>` +
          `</td></tr></table></td>`
      )
    }

    case 'document_summary': {
      const rows = block.rows
        .map(
          (line) =>
            `<tr>` +
            `<td style="${base}font-size:13px;color:${t.muted};padding:4px 16px 4px 0;white-space:nowrap;">${escapeHtml(line.label)}</td>` +
            `<td style="${base}font-size:14px;font-weight:600;color:${t.text};padding:4px 0;">${escapeHtml(line.value)}</td>` +
            `</tr>`
        )
        .join('')
      return row(
        `<td style="padding:0 0 18px 0;">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${t.panel};border:1px solid #e5e7eb;border-radius:6px;">` +
          `<tr><td style="padding:14px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>` +
          `</table></td>`
      )
    }

    case 'attachment_note':
      return row(
        `<td style="${base}font-size:13px;line-height:1.5;color:${t.muted};padding:0 0 14px 0;">${wordsHtml(block, t, { color: t.muted, fontSize: 13, lineHeight: 1.5 })}</td>`
      )

    case 'image': {
      const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" width="${block.width}" style="display:inline-block;border:0;max-width:100%;width:${block.width}px;height:auto;vertical-align:middle;" />`
      const href = block.href ? safeHref(block.href) : null
      const inner = href
        ? `<a href="${escapeHtml(href)}" style="text-decoration:none;">${img}</a>`
        : img
      return row(
        `<td align="${block.align}" style="padding:0 0 18px 0;text-align:${block.align};">${inner}</td>`
      )
    }

    case 'divider':
      return row(
        `<td style="padding:4px 0 18px 0;"><div style="height:1px;line-height:1px;font-size:0;background:#e5e7eb;">&nbsp;</div></td>`
      )

    case 'spacer':
      return row(
        `<td style="height:${block.height}px;line-height:${block.height}px;font-size:0;">&nbsp;</td>`
      )

    case 'contact_footer':
      return row(
        `<td style="${base}font-size:13px;line-height:1.5;color:${t.muted};padding:8px 0 0 0;">` +
          block.lines.map((line) => paragraphHtml(line)).join('<br />') +
          `</td>`
      )

    default:
      return ''
  }
}

/** A row of the mail; in a preview it also says which block it is. */
function tableRow(cell: string, blockId?: string): string {
  const mark = blockId ? ` data-block="${escapeHtml(blockId)}"` : ''
  return `<tr${mark}>${cell}</tr>`
}

/**
 * What the designer's preview adds to the mail: a hand cursor on every block
 * and an outline on the one that is selected or under the pointer. Never
 * part of a sent mail, which has no stylesheet at all.
 */
const PREVIEW_STYLE =
  '<style>' +
  '[data-block]{cursor:pointer}' +
  '[data-block]>td{outline:2px solid transparent;outline-offset:3px;border-radius:4px;transition:outline-color .12s}' +
  '[data-block]:hover>td{outline-color:rgba(37,99,235,.35)}' +
  '[data-block].is-selected>td{outline-color:#2563eb}' +
  '</style>'

export interface RenderHtmlOptions {
  /**
   * Mark every row with the id of the block it came from, for the designer's
   * preview to highlight and to answer clicks. Off for anything that is sent.
   */
  marked?: boolean
}

export function renderEmailHtml(spec: EmailSpec, options: RenderHtmlOptions = {}): string {
  const marked = options.marked === true
  const t = safeTheme(spec.theme)
  const body = spec.blocks.map((block) => blockHtml(block, t, marked)).join('')

  return (
    `<!doctype html><html><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<title>${escapeHtml(spec.subject)}</title>${marked ? PREVIEW_STYLE : ''}</head>` +
    `<body style="margin:0;padding:0;background:${t.background};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${t.background};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" style="width:100%;max-width:${WIDTH}px;">` +
    body +
    `</table></td></tr></table></body></html>`
  )
}
