/**
 * The tags a workshop may type into an email template, and how they are
 * filled.
 *
 * One registry for every mail. Each tag knows which group it belongs to (for
 * the picker), a stand-in value for the preview, and whether it is always
 * there or only sometimes: a parts sale has no vehicle, an invoice with no
 * customer has no name. The editor can warn about the sometimes ones, and
 * the presets are written so the sentence still reads when they are blank.
 *
 * Two rules decide what happens to a tag at send time:
 *
 * - A tag the kind offers but the send has no value for renders as nothing,
 *   and a block that is left with no words disappears. Nobody gets a mail
 *   saying "Hi {customer_name}".
 * - A tag the kind does not offer is refused when the template is saved, so
 *   it cannot reach a mail. A stored row from a future release that mentions
 *   a tag this code does not know is left as typed, which is the visible
 *   failure a stranger's row deserves.
 */

export type TagGroup = 'workshop' | 'customer' | 'vehicle' | 'document' | 'message' | 'portal'

export interface TagSpec {
  group: TagGroup
  /** What the preview shows in its place. */
  sample: string
  /** Not every send has one: the editor says so next to the tag. */
  optional?: boolean
}

export const TAGS = {
  workshop_name: { group: 'workshop', sample: 'Bergen Auto' },
  workshop_phone: { group: 'workshop', sample: '+47 55 00 00 00', optional: true },
  workshop_email: { group: 'workshop', sample: 'post@bergenauto.example', optional: true },
  workshop_address: { group: 'workshop', sample: 'Havnegata 3\n5003 Bergen', optional: true },
  current_user: { group: 'workshop', sample: 'Kari Nordmann', optional: true },

  customer_name: { group: 'customer', sample: 'Alex Carter', optional: true },

  vehicle: { group: 'vehicle', sample: '2019 Volvo V70', optional: true },
  plate: { group: 'vehicle', sample: 'AB 12345', optional: true },
  mileage: { group: 'vehicle', sample: '92 000', optional: true },

  document_number: { group: 'document', sample: 'INV-1042' },
  document_title: { group: 'document', sample: 'Brake service', optional: true },
  total: { group: 'document', sample: '1 250,00', optional: true },
  balance_due: { group: 'document', sample: '250,00', optional: true },
  due_date: { group: 'document', sample: '30 Sep 2026', optional: true },
  share_link: { group: 'document', sample: 'https://example.com/share/preview', optional: true },

  message: {
    group: 'message',
    sample: 'Your car is ready for pickup. We close at 17:00 today.',
    optional: true,
  },

  signin_link: { group: 'portal', sample: 'https://example.com/portal/sign-in/preview' },
  portal_link: { group: 'portal', sample: 'https://example.com/portal/preview', optional: true },
} as const satisfies Record<string, TagSpec>

export type EmailTag = keyof typeof TAGS

export const TAG_GROUPS: readonly TagGroup[] = [
  'workshop',
  'customer',
  'vehicle',
  'document',
  'message',
  'portal',
]

/**
 * Older spellings that still resolve, so wording copied from an SMS template
 * keeps working. Never offered by the picker.
 */
export const TAG_ALIASES: Record<string, EmailTag> = {
  company_name: 'workshop_name',
  invoice_number: 'document_number',
  amount: 'total',
}

export type TagValues = Partial<Record<EmailTag, string>>

const TAG_PATTERN = /\{(\w+)\}/g

export function isEmailTag(key: string): key is EmailTag {
  return Object.hasOwn(TAGS, key)
}

/** The tag a typed key means, aliases included; null when it is nothing. */
export function canonicalTag(key: string): EmailTag | null {
  if (isEmailTag(key)) return key
  return TAG_ALIASES[key] ?? null
}

export function tagsInGroup(group: TagGroup): EmailTag[] {
  return (Object.keys(TAGS) as EmailTag[]).filter((tag) => TAGS[tag].group === group)
}

/**
 * Fill the tags a template uses.
 *
 * `known` is the set of tags this kind offers. A known tag with no value
 * becomes nothing; a tag outside the set is left as typed. Tidies the
 * punctuation a blank leaves behind, so "Hi {customer_name}," with no name
 * reads "Hi," rather than "Hi ,".
 */
export function fillTags(
  template: string,
  values: TagValues,
  known: readonly EmailTag[] = Object.keys(TAGS) as EmailTag[]
): string {
  const knownSet = new Set<string>(known)
  const filled = template.replace(TAG_PATTERN, (match, key: string) => {
    const tag = canonicalTag(key)
    if (!tag || !knownSet.has(tag)) return match
    return values[tag] ?? ''
  })
  return tidy(filled)
}

/** Whitespace and punctuation left behind by a blank tag. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
}

/** Every tag a template mentions, in the order it first mentions them. */
export function tagsUsed(template: string): string[] {
  const seen = new Set<string>()
  for (const match of template.matchAll(TAG_PATTERN)) seen.add(match[1])
  return [...seen]
}

/** Tags a template mentions that the given set does not offer. */
export function unknownTags(template: string, allowed: readonly EmailTag[]): string[] {
  const known = new Set<string>(allowed)
  return tagsUsed(template).filter((key) => {
    const tag = canonicalTag(key)
    return !tag || !known.has(tag)
  })
}

/** Tags a template is required to carry but does not. */
export function missingTags(template: string, required: readonly EmailTag[]): string[] {
  const used = new Set(tagsUsed(template).map((key) => canonicalTag(key) ?? key))
  return required.filter((tag) => !used.has(tag))
}

/** Stand-in values for every tag, for a preview. */
export function sampleTagValues(overrides: TagValues = {}): TagValues {
  const values: TagValues = {}
  for (const tag of Object.keys(TAGS) as EmailTag[]) values[tag] = TAGS[tag].sample
  return { ...values, ...overrides }
}
