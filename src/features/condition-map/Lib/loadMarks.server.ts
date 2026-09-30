import 'server-only'
import { db } from '@/lib/db'
import { builtinMarkNames, conditionMapLabelsFrom, loadConditionMapMessages } from './labels'
import { type ConditionMarkData, type MarkScope, numberedMarks, splitMarks } from './marks'
import { type MarkType, type MarkTypeRow, resolveMarkTypes } from './markTypes'
import type { ConditionMapLabels, VisitConditionMap } from './print'

/**
 * Reading a vehicle's marks for a page or a print that has already decided
 * who may see them. Kept out of the actions file on purpose: every export of
 * a 'use server' module is callable from the browser, and these take the
 * organization as an argument rather than from the session.
 */

export const MARK_SELECT = {
  id: true,
  vehicleId: true,
  inspectionId: true,
  inspectionItemId: true,
  serviceRecordId: true,
  bodyType: true,
  view: true,
  panel: true,
  x: true,
  y: true,
  kind: true,
  severity: true,
  note: true,
  imageUrls: true,
  recordedAt: true,
  resolvedAt: true,
} as const

/** Every mark ever drawn on the vehicle, oldest first; resolved ones included as history. */
export async function loadVehicleConditionMarks(
  organizationId: string,
  vehicleId: string
): Promise<ConditionMarkData[]> {
  const rows = await db.conditionMark.findMany({
    where: { vehicleId, organizationId },
    select: {
      ...MARK_SELECT,
      serviceRecord: { select: { createdAt: true } },
      inspection: { select: { createdAt: true } },
    },
    orderBy: { recordedAt: 'asc' },
  })
  return numberedMarks(
    rows.map(({ serviceRecord, inspection, ...mark }) => ({
      ...mark,
      // A mark whose sheet was deleted keeps the moment it was recorded.
      sheetOpenedAt: serviceRecord?.createdAt ?? inspection?.createdAt ?? mark.recordedAt,
    }))
  )
}

/**
 * The marks this visit recorded and still open, with the drawing they are
 * on: what an invoice or a quote prints. Null when the document has no car
 * or the visit noted nothing.
 */
export async function loadVisitConditionMap(
  organizationId: string,
  vehicleId: string | null | undefined,
  scope: MarkScope
): Promise<{ marks: ConditionMarkData[]; bodyType: string | null } | null> {
  if (!vehicleId) return null
  const [marks, vehicle] = await Promise.all([
    loadVehicleConditionMarks(organizationId, vehicleId),
    db.vehicle.findFirst({ where: { id: vehicleId, organizationId }, select: { bodyType: true } }),
  ])
  const own = splitMarks(marks, scope).own
  if (own.length === 0) return null
  return { marks: own, bodyType: vehicle?.bodyType ?? null }
}

/**
 * The car's condition a quote prints: the marks drawn on the inspection it
 * came from and still open. A quote has no drop-off of its own, so one with
 * no inspection has nothing to print.
 */
export async function quoteConditionMap(
  organizationId: string,
  quote: { vehicleId: string | null; inspectionId: string | null },
  locale: string
): Promise<VisitConditionMap | undefined> {
  if (!quote.inspectionId) return undefined
  const map = await loadVisitConditionMap(organizationId, quote.vehicleId, {
    linkedInspectionId: quote.inspectionId,
  })
  return visitConditionMapIn(organizationId, map, locale)
}

/**
 * A visit's marks with the words to print them in, in the reader's language,
 * or nothing when the visit noted none. The kinds come from the workshop's
 * catalogue, or from the snapshot an issued invoice carries.
 */
export async function visitConditionMapIn(
  organizationId: string,
  map:
    | { marks: ConditionMarkData[]; bodyType: string | null; types?: MarkTypeRow[] | null }
    | null
    | undefined,
  locale: string
): Promise<VisitConditionMap | undefined> {
  if (!map || map.marks.length === 0) return undefined
  return { ...map, labels: await conditionMapLabelsFor(organizationId, locale, map.types) }
}

/** The workshop's stored changes to the catalogue. */
export async function loadMarkTypeRows(organizationId: string) {
  return db.conditionMarkType.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      key: true,
      name: true,
      shape: true,
      color: true,
      sortOrder: true,
      hidden: true,
    },
  })
}

/** The workshop's kinds of mark, named in the reader's language. */
export async function markTypeCatalogue(
  organizationId: string,
  locale: string
): Promise<MarkType[]> {
  const [rows, names] = await Promise.all([
    loadMarkTypeRows(organizationId),
    builtinMarkNames(locale),
  ])
  return resolveMarkTypes(rows, names)
}

/**
 * The words a print needs, with the kinds as this workshop has them, or as
 * a snapshot kept them: an issued invoice and a completed inspection print
 * the kinds they went out with.
 */
export async function conditionMapLabelsFor(
  organizationId: string,
  locale: string,
  frozenRows?: readonly MarkTypeRow[] | null
): Promise<ConditionMapLabels> {
  const messages = await loadConditionMapMessages(locale)
  // A snapshot keeps the workshop's changes only, so a built-in kind it
  // never touched is still named in the reader's language.
  const types = frozenRows
    ? resolveMarkTypes(frozenRows, messages.kinds)
    : await markTypeCatalogue(organizationId, locale)
  return conditionMapLabelsFrom(messages, types)
}
