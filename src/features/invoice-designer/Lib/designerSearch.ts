import {
  fold,
  type Match,
  matchItem,
  type PreparedItem,
  prepareItem,
  prepareQuery,
} from '@/features/search/Lib/matcher'
import {
  type InvoiceSection,
  type LayoutDocumentType,
  NO_CUSTOM_FIELD_SECTIONS,
  SECTIONS_WITH_FIELDS,
  toCustomFieldId,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  type FieldGates,
  type FieldSetting,
  fieldOffered,
  fieldWaitingOnSetting,
  resolveSectionFields,
  type SectionCustomField,
} from './sectionFields'

/**
 * The designer's search: every section in the rail, every field a section's
 * list offers, the workshop's own fields and the groups of the document's
 * styling. Nothing is listed here by hand. The sections come from the rail,
 * the fields from the rules the inspector draws its rows by, and the styling
 * groups from the list the inspector renders, so what is added to any of
 * them later is found without this file changing.
 */

/** The groups of the Document styling panel, in the order it shows them. */
export const DOCUMENT_STYLING_GROUPS = [
  { id: 'headerStyle', titleKey: 'headerStyleTitle' },
  { id: 'colors', titleKey: 'colors' },
  // Only a framed sheet has a frame to dress.
  { id: 'frame', titleKey: 'frame' },
  { id: 'typography', titleKey: 'typography' },
  { id: 'orgNumberLabel', titleKey: 'orgNumberLabel' },
  { id: 'page', titleKey: 'page' },
] as const

export type StylingGroupId = (typeof DOCUMENT_STYLING_GROUPS)[number]['id']

/** The title key of a styling group, under `settings.designer`. */
export function stylingGroupTitleKey(id: StylingGroupId): string {
  return DOCUMENT_STYLING_GROUPS.find((g) => g.id === id)?.titleKey ?? id
}

/**
 * How a result stands on the sheet: a field that prints, one switched off,
 * one in a section that is hidden, one the workshop has not switched on in
 * settings, or a field of the workshop's own that no section has placed.
 */
export type SearchEntryState = 'shown' | 'off' | 'hiddenSection' | 'needsSetting' | 'notPlaced'

export interface DesignerSearchEntry {
  /** Stable for the life of the list. */
  key: string
  kind: 'section' | 'field' | 'customField' | 'styling'
  /**
   * The section to open, or null for the document's styling. A field nobody
   * has placed has none of its own: see `customFieldHome`.
   */
  sectionId: string | null
  /** What the inspector marks: the `data-search-target` of a row, note, chip or group. */
  target: string
  title: string
  /** Where it lives, shown under the title. Empty for a section. */
  context: string
  state: SearchEntryState | null
  /** The workshop setting a `needsSetting` field waits on. */
  setting?: FieldSetting
  /** The workshop field's id, for a `customField`. */
  definitionId?: string
  keywords: string[]
}

export interface DesignerSearchIndex {
  entries: readonly {
    item: DesignerSearchEntry
    prepared: PreparedItem
    /** The words of the title, folded the way a query is. */
    titleWords: ReadonlySet<string>
    /** The extra words, each whole and each word of it. */
    aliasWords: ReadonlySet<string>
    /** The words of where it lives. */
    contextWords: ReadonlySet<string>
  }[]
}

/** The words of a text in any script, lower case and accent free. */
function wordsOf(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Extra words for a thing, from the messages: "po, purchase order". */
function splitAliases(words: string | undefined): string[] {
  return (words ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
}

/** Whether a section's field list takes the workshop's own fields. */
function takesCustomFields(sectionId: string): boolean {
  return SECTIONS_WITH_FIELDS.has(sectionId) && !NO_CUSTOM_FIELD_SECTIONS.has(sectionId)
}

export function buildDesignerSearchIndex({
  rail,
  documentType,
  customFields,
  gates,
  framed,
  sectionName,
  fieldName,
  stylingName,
  stylingContext,
  customFieldContext,
  aliases,
}: {
  /** The sections as the rail lists them. */
  rail: readonly InvoiceSection[]
  documentType: LayoutDocumentType
  /** The workshop's fields this document can place. */
  customFields: readonly SectionCustomField[]
  gates: FieldGates
  /** Whether the sheet has a frame, and so a Frame group. */
  framed: boolean
  sectionName: (sectionId: string) => string
  fieldName: (fieldId: string, sectionId: string) => string
  stylingName: (id: StylingGroupId) => string
  /** "Document styling", the line under a styling group. */
  stylingContext: string
  /** The line under a field no section has placed. */
  customFieldContext: string
  /** The extra words for a key, comma separated, or nothing. */
  aliases: (key: string) => string | undefined
}): DesignerSearchIndex {
  const items: DesignerSearchEntry[] = []
  const placed = new Set<string>()

  for (const section of rail) {
    items.push({
      key: `section:${section.id}`,
      kind: 'section',
      sectionId: section.id,
      target: 'section',
      title: sectionName(section.id),
      context: '',
      state: section.visible ? null : 'hiddenSection',
      keywords: splitAliases(aliases(`section_${section.id}`)),
    })
    if (!SECTIONS_WITH_FIELDS.has(section.id)) continue
    const { stored, resolvedFields } = resolveSectionFields(section, documentType, customFields)
    for (const field of stored) placed.add(field.id)
    for (const field of resolvedFields) {
      const offered = fieldOffered(section.id, field.id, documentType, gates)
      const setting = offered
        ? null
        : fieldWaitingOnSetting(section.id, field.id, documentType, gates)
      if (!offered && !setting) continue
      const aliasKey = section.id === 'equipment' ? `equipment_${field.id}` : field.id
      items.push({
        key: `field:${section.id}:${field.id}`,
        kind: 'field',
        sectionId: section.id,
        target: setting ? `setting:${field.id}` : `field:${field.id}`,
        title: fieldName(field.id, section.id),
        context: sectionName(section.id),
        state: setting
          ? 'needsSetting'
          : !section.visible
            ? 'hiddenSection'
            : field.visible
              ? 'shown'
              : 'off',
        setting: setting ?? undefined,
        keywords: splitAliases(aliases(aliasKey)),
      })
    }
  }

  // A field of the workshop's own that no section has placed yet waits as a
  // chip under every list that could take it, so it is listed once.
  if (rail.some((s) => takesCustomFields(s.id))) {
    for (const field of customFields) {
      if (!field.isActive || placed.has(toCustomFieldId(field.id))) continue
      items.push({
        key: `customField:${field.id}`,
        kind: 'customField',
        sectionId: null,
        target: `chip:${field.id}`,
        title: field.label || field.name,
        context: customFieldContext,
        state: 'notPlaced',
        definitionId: field.id,
        keywords: [],
      })
    }
  }

  for (const group of DOCUMENT_STYLING_GROUPS) {
    if (group.id === 'frame' && !framed) continue
    items.push({
      key: `styling:${group.id}`,
      kind: 'styling',
      sectionId: null,
      target: `styling:${group.id}`,
      title: stylingName(group.id),
      context: stylingContext,
      state: null,
      keywords: splitAliases(aliases(`styling_${group.id}`)),
    })
  }

  return {
    entries: items.map((item) => ({
      item,
      prepared: prepareItem({ title: item.title, keywords: item.keywords, context: item.context }),
      titleWords: new Set(wordsOf(item.title)),
      aliasWords: new Set(item.keywords.flatMap((k) => [fold(k), ...wordsOf(k)])),
      contextWords: new Set(wordsOf(item.context)),
    })),
  }
}

export interface DesignerSearchResult {
  entry: DesignerSearchEntry
  match: Match
}

/** A whole word of the title is what was typed: "PO" in "Your reference / PO". */
const WHOLE_TITLE_WORD = 1000
/** One of the extra words is what was typed. */
const WHOLE_ALIAS = 500

const startsAWordIn = (words: ReadonlySet<string>, token: string) => {
  for (const word of words) if (word.startsWith(token)) return true
  return false
}

/**
 * The best matches for what was typed, best first. Nothing typed, nothing
 * found.
 *
 * The app's matcher does the matching. Two things are added for a list this
 * small, where people type the short names they know a field by. A word typed
 * whole wins over one that merely starts the same way, so "PO" puts the
 * reference above the portal link. One or two letters have to start a
 * word, because inside a word ("po" in Typography) they find everything.
 * And a loose match, letters in order with others between them ("font" in
 * Footer Note), is only offered when nothing carries the word itself, which
 * keeps it for the misspelling it is there for.
 */
export function searchDesigner(
  index: DesignerSearchIndex,
  query: string,
  limit = 8
): DesignerSearchResult[] {
  const prepared = prepareQuery(query)
  if (prepared.tokens.length === 0) return []
  const out: {
    entry: DesignerSearchEntry
    match: Match
    score: number
    order: number
    /** Every word typed is in the title, an extra word or the place, as typed. */
    direct: boolean
  }[] = []
  index.entries.forEach((candidate, order) => {
    const match = matchItem(prepared, candidate.prepared)
    if (!match) return
    let score = match.score
    for (const token of prepared.tokens) {
      if (
        token.length <= 2 &&
        !startsAWordIn(candidate.titleWords, token) &&
        !startsAWordIn(candidate.aliasWords, token) &&
        !startsAWordIn(candidate.contextWords, token)
      ) {
        return
      }
      if (candidate.titleWords.has(token)) score += WHOLE_TITLE_WORD
      else if (candidate.aliasWords.has(token)) score += WHOLE_ALIAS
    }
    if (prepared.tokens.length > 1 && candidate.aliasWords.has(prepared.text)) score += WHOLE_ALIAS
    const { title, keywords, context } = candidate.prepared
    const direct = prepared.tokens.every(
      (token) =>
        title.text.includes(token) ||
        context.includes(token) ||
        keywords.some((keyword) => keyword.includes(token))
    )
    out.push({ entry: candidate.item, match, score, order, direct })
  })
  const kept = out.some((r) => r.direct) ? out.filter((r) => r.direct) : out
  // Ties go to a section before a field of the same name, then to the shorter
  // title, then to the order of the rail, so the list stays put while
  // somebody types.
  const sectionFirst = (r: (typeof out)[number]) => (r.entry.kind === 'section' ? 0 : 1)
  kept.sort(
    (a, b) =>
      b.score - a.score ||
      sectionFirst(a) - sectionFirst(b) ||
      a.entry.title.length - b.entry.title.length ||
      a.order - b.order
  )
  return kept.slice(0, limit).map(({ entry, match }) => ({ entry, match }))
}

/**
 * The section where a field nobody has placed is pointed out: the one that
 * is open when its list takes such fields, the customer's otherwise, and
 * failing that the first in the rail that does.
 */
export function customFieldHome(
  rail: readonly Pick<InvoiceSection, 'id'>[],
  selected: string | null
): string | null {
  const homes = rail.filter((s) => takesCustomFields(s.id)).map((s) => s.id)
  if (selected && homes.includes(selected)) return selected
  if (homes.includes('customer')) return 'customer'
  return homes[0] ?? null
}
