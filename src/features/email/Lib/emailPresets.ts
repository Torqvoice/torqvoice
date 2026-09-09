import { type EmailKind, kindSpec } from './emailKinds'
import { DEFAULT_EMAIL_THEME, type EmailBlock, type EmailTemplate } from './emailTemplate'

/**
 * What each kind of mail says before a workshop has changed anything.
 *
 * These are the starting points the gallery offers and the fallback when a
 * workshop has saved no template of its own, the way layoutPresets.ts works
 * for the sheet. The words come from messages/<locale>/email.json so a
 * workshop starts from its own language, and a customer whose workshop never
 * opened the editor gets the preset in theirs.
 *
 * Written with tags rather than fixed words so the same preset serves a mail
 * with a link and one with the PDF attached, and phrased so an optional tag
 * left blank still leaves a sentence: the vehicle lives in the summary panel,
 * not in the prose, because a parts sale has none.
 */

export interface PresetWords {
  name: string
  subject: string
  heading?: string
  intro?: string
  button?: string
  linkFallback?: string
  outro?: string
}

/** The shape of messages/<locale>/email.json. */
export interface EmailMessages {
  presets: Record<EmailKind, PresetWords>
  attachmentNote: string
  summary: { reference: string; vehicle: string; total: string; balance: string; due: string }
}

const block = (b: EmailBlock): EmailBlock => b

/** The blocks a kind starts with, in the order they appear. */
function presetBlocks(kind: EmailKind, words: PresetWords, attachmentNote: string): EmailBlock[] {
  const spec = kindSpec(kind)
  const blocks: EmailBlock[] = [block({ id: 'header', type: 'header' })]

  if (words.heading) blocks.push(block({ id: 'heading', type: 'heading', text: words.heading }))
  if (words.intro) blocks.push(block({ id: 'intro', type: 'paragraph', text: words.intro }))

  // The sender's own words for this send. On a document mail they are a
  // note beside the document; on a message they are the whole point.
  if (kind === 'message') {
    blocks.push(block({ id: 'message', type: 'callout', text: '{message}' }))
  } else if (spec.tags.includes('message')) {
    blocks.push(block({ id: 'message', type: 'paragraph', text: '{message}' }))
  }

  if (spec.hasSummary) blocks.push(block({ id: 'summary', type: 'document_summary' }))

  if (words.button) {
    const href =
      kind === 'portal_signin'
        ? '{signin_link}'
        : kind === 'team_invitation'
          ? '{invite_link}'
          : '{share_link}'
    blocks.push(block({ id: 'cta', type: 'button', label: words.button, href }))
  }
  if (words.linkFallback) {
    blocks.push(block({ id: 'link', type: 'paragraph', text: words.linkFallback }))
  }
  if (spec.hasAttachment) {
    blocks.push(block({ id: 'attachment', type: 'attachment_note', text: attachmentNote }))
  }
  if (words.outro) blocks.push(block({ id: 'outro', type: 'paragraph', text: words.outro }))

  blocks.push(
    block({ id: 'divider', type: 'divider' }),
    block({ id: 'footer', type: 'contact_footer' })
  )
  return blocks
}

/** The built-in template for a kind, in the language of the given messages. */
export function presetTemplate(kind: EmailKind, messages: EmailMessages): EmailTemplate {
  const words = messages.presets[kind]
  return {
    kind,
    name: words.name,
    subject: words.subject,
    theme: { ...DEFAULT_EMAIL_THEME },
    blocks: presetBlocks(kind, words, messages.attachmentNote),
  }
}
