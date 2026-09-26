import { z } from 'zod'
import { BODY_TYPES, PANELS, VIEWS, type BodyType, type Panel, type View } from './drawingTypes'

/**
 * What a mark on the condition map is, and how it is drawn.
 *
 * Each kind has a shape of its own as well as a colour, so a dent and a
 * scratch tell apart on a black-and-white print and to a colour-blind
 * reader; a major mark is drawn filled, a minor one outlined.
 */

export const MARK_KINDS = [
  'dent',
  'scratch',
  'chip',
  'crack',
  'rust',
  'paint',
  'previous_repair',
  'missing',
] as const
export type MarkKind = (typeof MARK_KINDS)[number]

export const SEVERITIES = ['minor', 'major'] as const
export type MarkSeverity = (typeof SEVERITIES)[number]

/** The shape each kind is drawn as, and its ink. */
export const MARK_STYLE: Record<
  MarkKind,
  { shape: 'circle' | 'diamond' | 'triangle' | 'square' | 'cross' | 'hex'; color: string }
> = {
  dent: { shape: 'circle', color: '#2563eb' },
  scratch: { shape: 'diamond', color: '#d97706' },
  chip: { shape: 'triangle', color: '#7c3aed' },
  crack: { shape: 'hex', color: '#dc2626' },
  rust: { shape: 'square', color: '#b45309' },
  paint: { shape: 'circle', color: '#0891b2' },
  previous_repair: { shape: 'square', color: '#6b7280' },
  missing: { shape: 'cross', color: '#dc2626' },
}

/** The ink of a mark from an earlier visit, still there and already known. */
export const PREVIOUS_MARK_COLOR = '#9ca3af'

export interface ConditionMarkData {
  id: string
  vehicleId: string
  inspectionId: string | null
  inspectionItemId: string | null
  serviceRecordId: string | null
  bodyType: string
  view: string
  panel: string
  x: number
  y: number
  kind: string
  severity: string
  note: string | null
  imageUrls: string[]
  recordedAt: Date | string
  resolvedAt: Date | string | null
}

export const markInputSchema = z.object({
  vehicleId: z.string().min(1),
  inspectionId: z.string().optional().nullable(),
  inspectionItemId: z.string().optional().nullable(),
  serviceRecordId: z.string().optional().nullable(),
  bodyType: z.enum(BODY_TYPES),
  view: z.enum(VIEWS),
  panel: z.enum(PANELS),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  kind: z.enum(MARK_KINDS),
  severity: z.enum(SEVERITIES).default('minor'),
  note: z.string().max(500).optional().nullable(),
})
export type MarkInput = z.infer<typeof markInputSchema>

export const markPatchSchema = z.object({
  kind: z.enum(MARK_KINDS).optional(),
  severity: z.enum(SEVERITIES).optional(),
  note: z.string().max(500).nullable().optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  view: z.enum(VIEWS).optional(),
  panel: z.enum(PANELS).optional(),
})
export type MarkPatch = z.infer<typeof markPatchSchema>

/** Where a map is being drawn: an inspection check, or a work order's drop-off. */
export type MarkScope =
  | { inspectionId: string; inspectionItemId: string }
  | { serviceRecordId: string }

/** Whether a mark was drawn on this sheet rather than an earlier one. */
export function isOwnMark(mark: ConditionMarkData, scope: MarkScope): boolean {
  if ('inspectionItemId' in scope) return mark.inspectionItemId === scope.inspectionItemId
  return mark.serviceRecordId === scope.serviceRecordId
}

/**
 * The marks as the map shows them: this sheet's own in full colour, and the
 * ones still open from earlier visits in grey, for the technician to confirm
 * or clear. A mark somebody resolved is history and is not drawn.
 */
export function splitMarks(
  marks: ConditionMarkData[],
  scope: MarkScope
): { own: ConditionMarkData[]; previous: ConditionMarkData[] } {
  const open = marks.filter((m) => !m.resolvedAt)
  return {
    own: open.filter((m) => isOwnMark(m, scope)),
    previous: open.filter((m) => !isOwnMark(m, scope)),
  }
}

export function isBodyType(value: unknown): value is BodyType {
  return typeof value === 'string' && (BODY_TYPES as readonly string[]).includes(value)
}

export function isPanel(value: unknown): value is Panel {
  return typeof value === 'string' && (PANELS as readonly string[]).includes(value)
}

export function isView(value: unknown): value is View {
  return typeof value === 'string' && (VIEWS as readonly string[]).includes(value)
}

/**
 * Which drawing a vehicle is marked on: what somebody chose for it, else a
 * guess from what the workshop services and what the registry said the
 * body was, else a sedan.
 */
export function bodyTypeFor(
  vehicle: { bodyType?: string | null },
  hints: { serviceType?: string | null; registryBody?: string | null } = {}
): BodyType {
  if (isBodyType(vehicle.bodyType)) return vehicle.bodyType
  if (hints.serviceType === 'marine') return 'boat'
  const guess = guessBodyType(hints.registryBody)
  return guess ?? 'sedan'
}

/** Reads a registry's or a person's word for the body into one of ours. */
export function guessBodyType(text: string | null | undefined): BodyType | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (/motor ?cycle|moped|scooter|\bmc\b|bike/.test(t)) return 'motorcycle'
  if (/boat|vessel|yacht|dinghy|rib\b/.test(t)) return 'boat'
  if (/pick ?up|ute\b|flatbed/.test(t)) return 'pickup'
  if (/van|panel|minibus|transporter|kasse/.test(t)) return 'van'
  if (/suv|4x4|off ?road|crossover|jeep/.test(t)) return 'suv'
  if (/hatch|3.?door|5.?door|compact|kombilimousine/.test(t)) return 'hatchback'
  if (/estate|wagon|touring|kombi|stasjonsvogn|break|avant|variant/.test(t)) return 'estate'
  if (/sedan|saloon|limousine|coupe|coupé|cabrio|convertible/.test(t)) return 'sedan'
  return null
}

/** Marks in the order they are numbered: by when they were recorded. */
export function numberedMarks<T extends { recordedAt: Date | string }>(marks: T[]): T[] {
  return [...marks].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  )
}
