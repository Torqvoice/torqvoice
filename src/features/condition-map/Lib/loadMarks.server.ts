import 'server-only'
import { db } from '@/lib/db'
import { visitConditionMapIn } from './labels'
import { type ConditionMarkData, type MarkScope, numberedMarks, splitMarks } from './marks'
import type { VisitConditionMap } from './print'

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
    select: MARK_SELECT,
    orderBy: { recordedAt: 'asc' },
  })
  return numberedMarks(rows)
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
  return visitConditionMapIn(map, locale)
}
