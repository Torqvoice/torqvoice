import type { EmailKind } from './emailKinds'
import { type RichDoc, richHrefs, richToPlain } from './richText'

/**
 * What an email template is made of.
 *
 * A list of blocks and a theme, not a canvas. The invoice designer places
 * blocks by anchor on a sheet of a known size; email has no fixed page, no
 * dependable flexbox or grid, and no position at all in Outlook. A layout
 * dragged anywhere could not be rendered faithfully, so the blocks are the
 * whole vocabulary and every one of them is something a workshop mail
 * actually needs.
 */
export const EMAIL_BLOCK_TYPES = [
  'header',
  'heading',
  'paragraph',
  'callout',
  'button',
  'document_summary',
  'attachment_note',
  'image',
  'divider',
  'spacer',
  'contact_footer',
] as const

export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number]

/** The rows the summary panel can show, in the order it shows them. */
export const SUMMARY_ROWS = ['reference', 'vehicle', 'total', 'balance', 'due'] as const
export type SummaryRowKey = (typeof SUMMARY_ROWS)[number]

export const BLOCK_ALIGNS = ['left', 'center', 'right'] as const
export type BlockAlign = (typeof BLOCK_ALIGNS)[number]

export interface EmailBlock {
  /** Stable across edits, so the editor can key rows and reorder them. */
  id: string
  type: EmailBlockType
  /** Absent counts as visible, the way a section's fields do. */
  visible?: boolean
  /**
   * heading, paragraph, callout, attachment_note: the words, tags and all.
   * Plain text, kept for presets and older rows; `content` wins when set.
   */
  text?: string
  /** The same words with formatting, as the designer's editor writes them. */
  content?: RichDoc
  /** button: what it says. */
  label?: string
  /** button: where it goes, usually a link tag such as {share_link}. */
  href?: string
  /** header, button, image: where it sits across the mail. Absent is left. */
  align?: BlockAlign
  /** image: the upload, as the protected file URL it was stored under. */
  src?: string
  /** image: what a reader who cannot see it is told. */
  alt?: string
  /** image: rendered width in pixels, up to the mail's 600. Absent is full width. */
  width?: number
  /** spacer: how much room, in pixels. */
  height?: number
  /** document_summary: which rows to show. Absent shows every row there is. */
  rows?: SummaryRowKey[]
  /**
   * header: the rule under the letterhead. Absent counts as on, so a
   * template saved before the rule existed keeps the look every mail has.
   */
  rule?: boolean
}

/**
 * Typefaces a mail client already has. Web fonts are not fetched by most
 * clients, so the choice is a stack, named by an id the theme stores.
 */
export const EMAIL_FONTS = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  arial: 'Arial, Helvetica, sans-serif',
  georgia: "Georgia, 'Times New Roman', serif",
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: "'Trebuchet MS', Helvetica, sans-serif",
  courier: "'Courier New', Courier, monospace",
} as const

export type EmailFontId = keyof typeof EMAIL_FONTS
export const EMAIL_FONT_IDS = Object.keys(EMAIL_FONTS) as EmailFontId[]

export interface EmailTheme {
  primaryColor: string
  textColor: string
  mutedColor: string
  backgroundColor: string
  /** Behind the summary and callout panels. */
  panelColor: string
  fontFamily: EmailFontId
  showLogo: boolean
  /**
   * The logo uploaded for email, as the protected upload URL it was stored
   * under. Its own upload rather than the company logo, so it can be sized
   * and trimmed for a mail header without touching the sheet's letterhead.
   * Empty means none: the header prints the workshop name instead.
   */
  logoUrl: string
  /** Rendered width of the logo, in pixels. */
  logoWidth: number
  /** Rounded corners on the button; Outlook squares them off regardless. */
  buttonRadius: number
  /** The bar in the primary colour along the top of the card. Absent counts as on. */
  topBar?: boolean
  /** How tall a line of text is, as a step. Absent counts as normal. */
  lineSpacing?: EmailLineSpacing
  /** How much room between paragraphs and text blocks, as a step. Absent counts as normal. */
  paragraphSpacing?: EmailParagraphSpacing
}

export const EMAIL_LINE_SPACINGS = ['compact', 'normal', 'relaxed'] as const
export type EmailLineSpacing = (typeof EMAIL_LINE_SPACINGS)[number]

export const EMAIL_PARAGRAPH_SPACINGS = ['tight', 'normal', 'loose'] as const
export type EmailParagraphSpacing = (typeof EMAIL_PARAGRAPH_SPACINGS)[number]

/**
 * What each step means in the mail. Body text is the reference; headings
 * and small print are scaled from it so the whole mail tightens or opens up
 * together, and a paragraph's own gap and the room between text blocks
 * follow the paragraph step.
 */
export const EMAIL_LINE_HEIGHTS: Record<EmailLineSpacing, number> = {
  compact: 1.4,
  normal: 1.6,
  relaxed: 1.8,
}

export const EMAIL_PARAGRAPH_GAPS: Record<
  EmailParagraphSpacing,
  { paragraph: number; block: number }
> = {
  tight: { paragraph: 4, block: 10 },
  normal: { paragraph: 10, block: 16 },
  loose: { paragraph: 16, block: 24 },
}

/** The spacing a theme asks for, with anything unknown read as normal. */
export function emailSpacing(theme: Pick<EmailTheme, 'lineSpacing' | 'paragraphSpacing'>) {
  const line = EMAIL_LINE_HEIGHTS[theme.lineSpacing ?? 'normal'] ?? EMAIL_LINE_HEIGHTS.normal
  const gaps =
    EMAIL_PARAGRAPH_GAPS[theme.paragraphSpacing ?? 'normal'] ?? EMAIL_PARAGRAPH_GAPS.normal
  const scale = line / EMAIL_LINE_HEIGHTS.normal
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    body: line,
    heading: round(1.3 * scale),
    small: round(1.5 * scale),
    paragraphGap: gaps.paragraph,
    blockGap: gaps.block,
  }
}

export const DEFAULT_EMAIL_THEME: EmailTheme = {
  primaryColor: '#d97706',
  textColor: '#111827',
  mutedColor: '#6b7280',
  backgroundColor: '#f6f7f9',
  panelColor: '#ffffff',
  fontFamily: 'system',
  showLogo: true,
  logoUrl: '',
  logoWidth: 140,
  buttonRadius: 6,
  topBar: true,
}

export const EMAIL_LOGO_MIN_WIDTH = 60
export const EMAIL_LOGO_MAX_WIDTH = 320

/** Where email uploads are stored under, as protected file URLs. */
export const EMAIL_LOGO_CATEGORY = 'email-logos'
export const EMAIL_IMAGE_CATEGORY = 'email-images'
export const EMAIL_ASSET_CATEGORIES = [EMAIL_LOGO_CATEGORY, EMAIL_IMAGE_CATEGORY] as const

export const EMAIL_IMAGE_MIN_WIDTH = 100
export const EMAIL_IMAGE_MAX_WIDTH = 600

const EMAIL_ASSET_URL =
  /^\/api\/protected\/files\/([A-Za-z0-9_-]+)\/(email-logos|email-images)\/([A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp))$/

/** The parts of a stored email upload URL, or null for anything else. */
export function parseEmailAssetUrl(
  value: string | undefined | null
): { organizationId: string; category: string; file: string } | null {
  const match = value ? EMAIL_ASSET_URL.exec(value) : null
  return match ? { organizationId: match[1], category: match[2], file: match[3] } : null
}

export function isEmailLogoUrl(value: string): boolean {
  return parseEmailAssetUrl(value)?.category === EMAIL_LOGO_CATEGORY
}

export function isEmailImageUrl(value: string): boolean {
  return parseEmailAssetUrl(value)?.category === EMAIL_IMAGE_CATEGORY
}

/**
 * The public address a mail client can fetch a stored email upload from, or
 * nothing for an empty or foreign value. Relative; a sender prepends the
 * app's base URL.
 */
export function emailAssetPublicPath(storedUrl: string | undefined | null): string | undefined {
  const parts = parseEmailAssetUrl(storedUrl)
  if (!parts) return undefined
  const route = parts.category === EMAIL_LOGO_CATEGORY ? 'email-logo' : 'email-image'
  return `/api/public/${route}/${parts.organizationId}/${parts.file}`
}

export const emailLogoPublicPath = emailAssetPublicPath
export const emailImagePublicPath = emailAssetPublicPath

/** Every upload a template refers to: its logo and its image blocks. */
export function templateAssets(template: Pick<EmailTemplate, 'blocks' | 'theme'>): string[] {
  const out = new Set<string>()
  if (template.theme.logoUrl && parseEmailAssetUrl(template.theme.logoUrl)) {
    out.add(template.theme.logoUrl)
  }
  for (const block of template.blocks) {
    if (block.type === 'image' && block.src && parseEmailAssetUrl(block.src)) out.add(block.src)
  }
  return [...out]
}

export interface EmailTemplate {
  kind: EmailKind
  name: string
  subject: string
  blocks: EmailBlock[]
  theme: EmailTheme
}

/** A template the workshop saved, as the gallery and the designer see it. */
export interface SavedEmailTemplate extends EmailTemplate {
  id: string
  updatedAt: string
}

/** Every piece of writing in a template, for checking tags across all of it. */
export function templateText(template: Pick<EmailTemplate, 'subject' | 'blocks'>): string {
  return [
    template.subject,
    ...template.blocks.flatMap((block) => [
      blockTaggable(block),
      block.label,
      block.href,
      block.alt,
    ]),
  ]
    .filter(Boolean)
    .join('\n')
}

/** What a text block says, formatting aside. */
export function blockWords(block: EmailBlock): string {
  return block.content ? richToPlain(block.content) : (block.text ?? '')
}

/** Everything typed into a text block that may carry a tag: words and link addresses. */
function blockTaggable(block: EmailBlock): string {
  if (!block.content) return block.text ?? ''
  return [richToPlain(block.content), ...richHrefs(block.content)].join('\n')
}

/** The setting that says which template a kind sends with. */
export function activeTemplateSettingKey(kind: EmailKind): string {
  return `email.template.${kind}`
}

/**
 * What an active-template setting points at. "design:<id>" is a saved row;
 * anything else, including no setting at all, is the built-in preset.
 */
export function activeTemplateId(value: string | undefined | null): string | null {
  if (!value?.startsWith('design:')) return null
  const id = value.slice('design:'.length)
  return id || null
}
