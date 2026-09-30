import { MARK_KINDS, MARK_STYLE, type MarkKind } from './marks'

/**
 * The kinds of mark a workshop draws, as a catalogue.
 *
 * Eight kinds are built in, each with a shape and a colour, and named in the
 * reader's language. A workshop can rename or recolour one of them, hide the
 * ones it never uses, and add kinds of its own with a shape and a colour and
 * a name in its own words. A mark stores only a kind's key, so the catalogue
 * is where everything else about it is read from: the screen, the prints and
 * the legend all go through `markTypeOf`.
 *
 * A key nobody knows any more (a kind deleted, a backup from another
 * workshop) still draws, as a grey circle named by its key: a mark is never
 * lost for want of its type.
 */

export const MARK_SHAPES = ['circle', 'diamond', 'triangle', 'square', 'cross', 'hex'] as const
export type MarkShape = (typeof MARK_SHAPES)[number]

export function isMarkShape(value: unknown): value is MarkShape {
  return typeof value === 'string' && (MARK_SHAPES as readonly string[]).includes(value)
}

/** The colours the picker offers; any hex colour is accepted. */
export const MARK_COLORS = [
  '#2563eb',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#b45309',
  '#0891b2',
  '#6b7280',
  '#059669',
  '#e11d48',
  '#111827',
] as const

export interface MarkType {
  key: string
  name: string
  shape: MarkShape
  color: string
  hidden: boolean
  /** One of the eight the app ships with, whether or not the workshop changed it. */
  builtin: boolean
  /** The workshop has changed it, or made it: there is a row of its own. */
  changed: boolean
  sortOrder: number
}

/** A stored row: a built-in kind changed, or a kind of the workshop's own. */
export interface MarkTypeRow {
  key: string
  name: string
  shape: string
  color: string
  sortOrder: number
  hidden: boolean
}

/** What a snapshot keeps of a kind: enough to draw and name a mark of it. */
export interface MarkTypeRef {
  key: string
  name: string
  shape: string
  color: string
}

export const BUILTIN_MARK_KEYS: readonly MarkKind[] = MARK_KINDS

export function isBuiltinMarkKey(key: string): key is MarkKind {
  return (MARK_KINDS as readonly string[]).includes(key)
}

const FALLBACK_COLOR = '#6b7280'

/**
 * The catalogue: the built-in kinds, each as the workshop left it, then the
 * workshop's own, in the order the workshop keeps them. `builtinNames` are
 * the built-in kinds' names in the reader's language.
 */
export function resolveMarkTypes(
  rows: readonly MarkTypeRow[],
  builtinNames: Record<string, string>
): MarkType[] {
  const byKey = new Map(rows.map((row) => [row.key, row]))
  const builtins: MarkType[] = MARK_KINDS.map((key, index) => {
    const row = byKey.get(key)
    const style = MARK_STYLE[key]
    return {
      key,
      name: row?.name.trim() || builtinNames[key] || key,
      shape: row && isMarkShape(row.shape) ? row.shape : style.shape,
      color: row?.color || style.color,
      hidden: row?.hidden ?? false,
      builtin: true,
      changed: row !== undefined,
      sortOrder: row?.sortOrder ?? index,
    }
  })
  const own: MarkType[] = rows
    .filter((row) => !isBuiltinMarkKey(row.key))
    .map((row) => ({
      key: row.key,
      name: row.name,
      shape: isMarkShape(row.shape) ? row.shape : 'circle',
      color: row.color || FALLBACK_COLOR,
      hidden: row.hidden,
      builtin: false,
      changed: true,
      sortOrder: row.sortOrder,
    }))
  return [...builtins, ...own].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** The catalogue as the app ships it, in the names given. */
export function builtinMarkTypes(names: Record<string, string>): MarkType[] {
  return resolveMarkTypes([], names)
}

/** The kind a mark carries, or a stand-in that still draws and names it. */
export function markTypeOf(types: readonly MarkTypeRef[], key: string): MarkTypeRef {
  return (
    types.find((type) => type.key === key) ?? {
      key,
      name: key.replace(/_/g, ' '),
      shape: 'circle',
      color: FALLBACK_COLOR,
    }
  )
}

/** How a mark of this kind is drawn. */
export function markStyleOf(
  types: readonly MarkTypeRef[],
  key: string
): { shape: MarkShape; color: string } {
  const type = markTypeOf(types, key)
  return { shape: isMarkShape(type.shape) ? type.shape : 'circle', color: type.color }
}

/** What a snapshot keeps of the catalogue. */
export function markTypeRefs(types: readonly MarkType[]): MarkTypeRef[] {
  return types.map(({ key, name, shape, color }) => ({ key, name, shape, color }))
}

/** A key for a kind of the workshop's own, from its row id. */
export function ownMarkKey(id: string): string {
  return `own_${id}`
}
