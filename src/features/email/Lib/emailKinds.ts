import type { EmailTag } from './tags'

/**
 * Every kind of mail a workshop can design, in one place.
 *
 * A kind is an operation the app performs, not a send: every invoice goes out
 * through `invoice_sent`, so a change to that template lands everywhere an
 * invoice is mailed from. Adding a kind is one entry here, one preset in
 * messages/<locale>/email.json, and a context in emailContext.ts; the gallery,
 * the designer, the tag picker and the resolver read this table.
 */
export const EMAIL_KINDS = [
  'invoice_sent',
  'quote_sent',
  'inspection_sent',
  'message',
  'portal_signin',
  'team_invitation',
] as const

export type EmailKind = (typeof EMAIL_KINDS)[number]

export type EmailKindGroup = 'documents' | 'messages' | 'portal' | 'team'

export const EMAIL_KIND_GROUPS: readonly EmailKindGroup[] = [
  'documents',
  'messages',
  'portal',
  'team',
]

export interface EmailKindSpec {
  group: EmailKindGroup
  /** Tags this kind can fill. Everything else is refused on save. */
  tags: readonly EmailTag[]
  /**
   * Tags the kind cannot do without. A sign-in mail with no sign-in link is
   * undeliverable in the only sense that matters, so the editor refuses to
   * save one. Checked across subject and every block.
   */
  required: readonly EmailTag[]
  /** Whether the summary panel has anything to show for this kind. */
  hasSummary: boolean
  /** Whether a PDF may ride along, which is what the attachment note is for. */
  hasAttachment: boolean
}

const WORKSHOP: readonly EmailTag[] = [
  'workshop_name',
  'workshop_phone',
  'workshop_email',
  'workshop_address',
  'current_user',
]
const CUSTOMER: readonly EmailTag[] = ['customer_name']
const VEHICLE: readonly EmailTag[] = ['vehicle', 'plate', 'mileage']
const DOCUMENT: readonly EmailTag[] = [
  'document_number',
  'document_title',
  'total',
  'balance_due',
  'due_date',
  'share_link',
]

export const EMAIL_KIND_SPECS: Record<EmailKind, EmailKindSpec> = {
  invoice_sent: {
    group: 'documents',
    tags: [...WORKSHOP, ...CUSTOMER, ...VEHICLE, ...DOCUMENT, 'message'],
    required: [],
    hasSummary: true,
    hasAttachment: true,
  },
  quote_sent: {
    group: 'documents',
    tags: [...WORKSHOP, ...CUSTOMER, ...VEHICLE, ...DOCUMENT, 'message'],
    required: [],
    hasSummary: true,
    hasAttachment: true,
  },
  inspection_sent: {
    group: 'documents',
    tags: [...WORKSHOP, ...CUSTOMER, ...VEHICLE, 'share_link', 'message'],
    required: [],
    hasSummary: false,
    hasAttachment: true,
  },
  message: {
    group: 'messages',
    tags: [...WORKSHOP, ...CUSTOMER, ...VEHICLE, 'message', 'portal_link'],
    required: ['message'],
    hasSummary: false,
    hasAttachment: false,
  },
  portal_signin: {
    group: 'portal',
    tags: [...WORKSHOP, ...CUSTOMER, 'signin_link'],
    required: ['signin_link'],
    hasSummary: false,
    hasAttachment: false,
  },
  // Sent to a colleague, not a customer: the sender is the one inviting,
  // and the link creates an account rather than opening a document.
  team_invitation: {
    group: 'team',
    tags: [...WORKSHOP, 'invite_link', 'role', 'invite_expires'],
    required: ['invite_link'],
    hasSummary: false,
    hasAttachment: false,
  },
}

export function isEmailKind(value: string): value is EmailKind {
  return (EMAIL_KINDS as readonly string[]).includes(value)
}

export function kindSpec(kind: EmailKind): EmailKindSpec {
  return EMAIL_KIND_SPECS[kind]
}

export function kindsInGroup(group: EmailKindGroup): EmailKind[] {
  return EMAIL_KINDS.filter((kind) => EMAIL_KIND_SPECS[kind].group === group)
}
