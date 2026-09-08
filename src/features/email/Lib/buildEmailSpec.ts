import type { SummaryRow } from './emailContext'
import { kindSpec } from './emailKinds'
import {
  type BlockAlign,
  EMAIL_IMAGE_MAX_WIDTH,
  type EmailBlock,
  type EmailTemplate,
  type EmailTheme,
  emailAssetPublicPath,
} from './emailTemplate'
import { safeHref } from './links'
import { mapRichText, type RichDoc, richToPlain } from './richText'
import { fillTags, type TagValues } from './tags'

/**
 * A template plus the job it is about, resolved into what the mail says.
 *
 * The one tree both renderers read. The HTML one draws it as tables for mail
 * clients, the text one writes it out as plain text; neither decides anything
 * about content, so the two can never say different things. This is the
 * invoice designer's arrangement with a renderer that respects what email is.
 */

/** Words with their formatting, and the same words flat for the text part. */
export interface SpecText {
  text: string
  rich?: RichDoc
}

type SpecBlockBody =
  | { type: 'header'; workshopName: string; logoUrl?: string; logoWidth: number; align: BlockAlign }
  | ({ type: 'heading' } & SpecText)
  | ({ type: 'paragraph' } & SpecText)
  | ({ type: 'callout' } & SpecText)
  | { type: 'button'; label: string; href: string; align: BlockAlign }
  | { type: 'document_summary'; rows: SummaryRow[] }
  | ({ type: 'attachment_note' } & SpecText)
  | { type: 'image'; src: string; alt: string; width: number; align: BlockAlign; href?: string }
  | { type: 'divider' }
  | { type: 'spacer'; height: number }
  | { type: 'contact_footer'; lines: string[] }

/** A resolved block, still carrying the id of the block it came from, so a preview can point back at it. */
export type SpecBlock = SpecBlockBody & { id: string }

export interface EmailSpec {
  subject: string
  theme: EmailTheme
  blocks: SpecBlock[]
}

export interface EmailSpecInput {
  values: TagValues
  /** Absolute, because a mail cannot resolve a relative path. */
  logoUrl?: string
  /** Rows for the summary block, labels already worded for the reader. */
  summary?: SummaryRow[]
  /** Whether a PDF rides along, which is what the attachment note is for. */
  attached?: boolean
  /**
   * Where each stored upload can be fetched from by the reader. The designer
   * leaves this out and gets the relative public path; a sender passes
   * absolute addresses, and nothing at all for a file that is gone, which
   * drops the block rather than sending a broken image.
   */
  assets?: Record<string, string | undefined>
}

/** A block with no words left after its tags are filled prints nothing. */
function resolveBlock(
  block: EmailBlock,
  template: EmailTemplate,
  input: EmailSpecInput
): SpecBlockBody | null {
  if (block.visible === false) return null
  const known = kindSpec(template.kind).tags
  const fill = (text: string | undefined) =>
    text ? fillTags(text, input.values, known).trim() : ''

  // A text block's words, filled: the rich tree when the designer wrote one,
  // else the plain string. Nothing left after filling means no block.
  const words = (): SpecText | null => {
    if (block.content) {
      const rich = mapRichText(block.content, (text) => fillTags(text, input.values, known))
      const text = richToPlain(rich)
      return text ? { text, rich } : null
    }
    const text = fill(block.text)
    return text ? { text } : null
  }

  switch (block.type) {
    case 'header':
      return {
        type: 'header',
        workshopName: input.values.workshop_name ?? '',
        logoUrl: template.theme.showLogo ? input.logoUrl : undefined,
        logoWidth: template.theme.logoWidth,
        align: block.align ?? 'left',
      }

    case 'heading': {
      const w = words()
      return w ? { type: 'heading', ...w } : null
    }

    case 'paragraph': {
      const w = words()
      return w ? { type: 'paragraph', ...w } : null
    }

    case 'callout': {
      const w = words()
      return w ? { type: 'callout', ...w } : null
    }

    case 'button': {
      const href = fill(block.href)
      const label = fill(block.label)
      // A link tag with no value fills to nothing, and a stored row from a
      // future release might carry a tag this code cannot fill at all; a
      // button pointing at "{share_link}" is worse than no button.
      if (!href || !label || href.includes('{')) return null
      return { type: 'button', label, href, align: block.align ?? 'left' }
    }

    case 'document_summary': {
      const wanted = block.rows ? new Set(block.rows) : null
      const rows = (input.summary ?? []).filter(
        (row) => row.value && (!wanted || wanted.has(row.key))
      )
      return rows.length ? { type: 'document_summary', rows } : null
    }

    case 'attachment_note': {
      if (!input.attached) return null
      const w = words()
      return w ? { type: 'attachment_note', ...w } : null
    }

    case 'image': {
      if (!block.src) return null
      const src = input.assets ? input.assets[block.src] : emailAssetPublicPath(block.src)
      if (!src) return null
      const href = block.href ? fill(block.href) : ''
      return {
        type: 'image',
        src,
        alt: fill(block.alt) || '',
        width: Math.min(EMAIL_IMAGE_MAX_WIDTH, block.width ?? EMAIL_IMAGE_MAX_WIDTH),
        align: block.align ?? 'left',
        href: href && !href.includes('{') && safeHref(href) ? href : undefined,
      }
    }

    case 'divider':
      return { type: 'divider' }

    case 'spacer':
      return { type: 'spacer', height: block.height ?? 16 }

    case 'contact_footer': {
      const lines = [
        input.values.workshop_name,
        input.values.workshop_address,
        [input.values.workshop_phone, input.values.workshop_email].filter(Boolean).join(' · '),
      ]
        .map((line) => line?.trim())
        .filter((line): line is string => !!line)
      return lines.length ? { type: 'contact_footer', lines } : null
    }

    default:
      return null
  }
}

export function buildEmailSpec(template: EmailTemplate, input: EmailSpecInput): EmailSpec {
  const blocks = template.blocks
    .map((block) => {
      const body = resolveBlock(block, template, input)
      return body ? ({ ...body, id: block.id } as SpecBlock) : null
    })
    .filter((block): block is SpecBlock => block !== null)

  return {
    subject: fillTags(template.subject, input.values, kindSpec(template.kind).tags).trim(),
    theme: template.theme,
    blocks: collapseSpacing(blocks),
  }
}

/**
 * Room and rules only mean anything between two things. A divider that opens
 * the mail, or two spacers left behind by a hidden block, are noise the
 * workshop did not ask for.
 */
function collapseSpacing(blocks: SpecBlock[]): SpecBlock[] {
  const isSpacing = (block: SpecBlock | undefined) =>
    block?.type === 'divider' || block?.type === 'spacer'

  const out: SpecBlock[] = []
  for (const block of blocks) {
    if (isSpacing(block) && (out.length === 0 || isSpacing(out[out.length - 1]))) continue
    out.push(block)
  }
  while (out.length && isSpacing(out[out.length - 1])) out.pop()
  return out
}
