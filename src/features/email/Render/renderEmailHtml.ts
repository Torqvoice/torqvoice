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
 * The shape is a card: a bar in the workshop's colour, a white sheet with
 * the words on it, and the workshop's contact lines quietly underneath. The
 * card is the renderer's, not a block, so every template a workshop makes
 * sits on the same paper and only decides what is written on it.
 *
 * The workshop never types HTML, so nothing here has to survive a paste from
 * Word. Every string that came from a person is escaped on the way in, and
 * the theme is checked again here even though the schema already did: this
 * file is the last thing between a stored row and somebody's inbox.
 */

const WIDTH = 600

/** The hairline everything inside the card is ruled with. */
const RULE = '#e6e8ec'

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
    headerRule: theme.headerRule !== false,
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

/** The summary rows that carry money, drawn heavier than the rest. */
const EMPHASISED_ROWS = new Set(['total', 'balance'])

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
          ? `<span style="${base}font-size:19px;font-weight:700;letter-spacing:-0.2px;color:${t.text};">${escapeHtml(block.workshopName)}</span>`
          : ''
      if (!logo) return ''
      // The td's align attribute is what Outlook reads; the style is for
      // everyone else. The image is inline so the alignment applies to it.
      // A rule under the letterhead, and room after it, so the mark and the
      // heading are not two bold lines fighting over the top of the card.
      // The theme can take the rule away; the room stays.
      const rule = t.headerRule ? `border-bottom:1px solid ${RULE};` : ''
      return (
        row(
          `<td align="${block.align}" style="padding:0 0 20px 0;text-align:${block.align};${rule}">${logo}</td>`
        ) + `<tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>`
      )
    }

    case 'heading':
      return row(
        `<td style="${base}font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.2px;color:${t.text};padding:0 0 14px 0;">${wordsHtml(block, t, { color: t.text, fontSize: 22, lineHeight: 1.3 })}</td>`
      )

    case 'paragraph':
      return row(
        `<td style="${base}font-size:15px;line-height:1.6;color:${t.text};padding:0 0 16px 0;">${wordsHtml(block, t, { color: t.text, fontSize: 15, lineHeight: 1.6 })}</td>`
      )

    case 'callout':
      return row(
        `<td style="padding:2px 0 20px 0;">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${t.background}" style="background:${t.background};border-left:4px solid ${t.primary};border-radius:6px;">` +
          `<tr><td style="${base}font-size:15px;line-height:1.6;color:${t.text};padding:16px 18px;">${wordsHtml(block, t, { color: t.text, fontSize: 15, lineHeight: 1.6 })}</td></tr>` +
          `</table></td>`
      )

    case 'button': {
      const href = safeHref(block.href)
      if (!href) return ''
      // A table around the anchor, because Outlook ignores padding on one.
      const side = block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : 'left'
      return row(
        `<td align="${side}" style="padding:6px 0 24px 0;text-align:${side};">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${side}" style="display:inline-table;"><tr>` +
          `<td align="center" bgcolor="${t.primary}" style="border-radius:${t.radius}px;">` +
          `<a href="${escapeHtml(href)}" style="${base}display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:${t.radius}px;">${escapeHtml(block.label)}</a>` +
          `</td></tr></table></td>`
      )
    }

    case 'document_summary': {
      // A receipt: labels down the left, figures on the right, a rule
      // between lines, and the money set heavier so it is what the eye
      // lands on. The balance is in the workshop's colour, because it is
      // the one number the customer has to act on.
      const last = block.rows.length - 1
      const rows = block.rows
        .map((line, i) => {
          const money = EMPHASISED_ROWS.has(line.key)
          const rule = i < last ? `border-bottom:1px solid ${RULE};` : ''
          const valueColor = line.key === 'balance' ? t.primary : t.text
          const valueSize = money ? 16 : 14
          const weight = money ? 700 : 600
          return (
            `<tr>` +
            `<td style="${base}font-size:13px;color:${t.muted};padding:10px 16px 10px 0;white-space:nowrap;${rule}">${escapeHtml(line.label)}</td>` +
            `<td align="right" style="${base}font-size:${valueSize}px;font-weight:${weight};color:${valueColor};padding:10px 0;text-align:right;${rule}">${escapeHtml(line.value)}</td>` +
            `</tr>`
          )
        })
        .join('')
      return row(
        `<td style="padding:2px 0 22px 0;">` +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${t.background}" style="background:${t.background};border-radius:8px;">` +
          `<tr><td style="padding:6px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr>` +
          `</table></td>`
      )
    }

    case 'attachment_note':
      return row(
        `<td style="${base}font-size:13px;line-height:1.5;color:${t.muted};padding:0 0 16px 0;">${wordsHtml(block, t, { color: t.muted, fontSize: 13, lineHeight: 1.5 })}</td>`
      )

    case 'image': {
      const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" width="${block.width}" style="display:inline-block;border:0;max-width:100%;width:${block.width}px;height:auto;vertical-align:middle;border-radius:6px;" />`
      const href = block.href ? safeHref(block.href) : null
      const inner = href
        ? `<a href="${escapeHtml(href)}" style="text-decoration:none;">${img}</a>`
        : img
      return row(
        `<td align="${block.align}" style="padding:0 0 20px 0;text-align:${block.align};">${inner}</td>`
      )
    }

    case 'divider':
      return row(
        `<td style="padding:6px 0 22px 0;"><div style="height:1px;line-height:1px;font-size:0;background:${RULE};">&nbsp;</div></td>`
      )

    case 'spacer':
      return row(
        `<td style="height:${block.height}px;line-height:${block.height}px;font-size:0;">&nbsp;</td>`
      )

    case 'contact_footer':
      return row(contactFooterCell(block.lines, t, 'left', '8px 0 0 0'))

    default:
      return ''
  }
}

/**
 * The workshop's contact lines. The name is set a shade darker than the
 * rest so the footer still says who wrote, without shouting.
 */
function contactFooterCell(
  lines: string[],
  t: SafeTheme,
  align: 'left' | 'center',
  padding: string
): string {
  const [name, ...rest] = lines
  const nameHtml = name
    ? `<span style="font-weight:600;color:${t.text};">${paragraphHtml(name)}</span>`
    : ''
  const body = [nameHtml, ...rest.map((line) => paragraphHtml(line))].filter(Boolean).join('<br />')
  return `<td align="${align}" style="font-family:${t.font};font-size:12.5px;line-height:1.6;color:${t.muted};padding:${padding};text-align:${align};">${body}</td>`
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

/**
 * The line an inbox shows after the subject. Hidden in the mail itself;
 * without it the client shows whatever text comes first, which is the
 * workshop's name again.
 */
function preheaderHtml(text: string | undefined): string {
  if (!text) return ''
  // The filler keeps the client from pulling the body text in after it.
  const filler = '&zwnj;&nbsp;'.repeat(40)
  return `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent;opacity:0;mso-hide:all;">${escapeHtml(text)}${filler}</div>`
}

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

  // The contact lines go under the card when they close the mail, which is
  // where a signature belongs; placed anywhere else they stay a block among
  // blocks. A rule left standing at the card's foot when the footer moves
  // out would underline nothing, so it goes with it.
  let inside = spec.blocks
  let footer: Extract<SpecBlock, { type: 'contact_footer' }> | null = null
  const lastBlock = inside[inside.length - 1]
  if (lastBlock?.type === 'contact_footer') {
    footer = lastBlock
    inside = inside.slice(0, -1)
    while (inside.length && ['divider', 'spacer'].includes(inside[inside.length - 1].type)) {
      inside = inside.slice(0, -1)
    }
  }

  const body = inside.map((block) => blockHtml(block, t, marked)).join('')
  const footerRow = footer
    ? tableRow(
        contactFooterCell(footer.lines, t, 'center', '22px 12px 0 12px'),
        marked ? footer.id : undefined
      )
    : ''

  return (
    `<!doctype html><html><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<title>${escapeHtml(spec.subject)}</title>${marked ? PREVIEW_STYLE : ''}</head>` +
    `<body style="margin:0;padding:0;background:${t.background};">` +
    preheaderHtml(spec.preheader) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${t.background}" style="background:${t.background};">` +
    `<tr><td align="center" style="padding:32px 16px 40px 16px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" style="width:100%;max-width:${WIDTH}px;">` +
    // The bar: the workshop's colour, five pixels of it, along the top of
    // the card. Enough to be the brand at a glance, not enough to compete
    // with a logo underneath.
    `<tr><td bgcolor="${t.primary}" style="background:${t.primary};height:5px;line-height:5px;font-size:0;border-radius:10px 10px 0 0;">&nbsp;</td></tr>` +
    `<tr><td bgcolor="${t.panel}" style="background:${t.panel};border:1px solid ${RULE};border-top:0;border-radius:0 0 10px 10px;padding:32px 36px 24px 36px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
    body +
    `</table></td></tr>` +
    footerRow +
    `</table></td></tr></table></body></html>`
  )
}
