import 'server-only'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { DROPOFF_SLOTS, isDropoffSlot } from '@/lib/dropoff-slots'
import { getBodyDrawing } from '../Drawings'
import { composeViews, placedLines, placedPanels } from './compose'
import { BODY_TYPES, type BodyType, VIEW_SIZE } from './drawingTypes'
import { loadConditionMapMessages } from './labels'
import { loadVehicleConditionMarks, markTypeCatalogue } from './loadMarks.server'
import {
  type ConditionMarkData,
  type MarkScope,
  bodyTypeFor,
  isBodyType,
  isDrawnOnSheet,
  numberedMarks,
  splitMarks,
} from './marks'

/**
 * A work order's check-in as the technician app draws it: the mileage, the
 * drop-off photos by position, and the condition map with every mark the
 * web's Drop-off tab shows, numbered the same way.
 *
 * The drawing goes over the wire as placed paths rather than being bundled
 * into the app, so a new body type or a redrawn panel reaches phones with
 * the next web deploy, not the next store release.
 */

export interface CheckinMark {
  id: string
  number: number
  bodyType: string
  view: string
  panel: string
  panelName: string
  x: number
  y: number
  kind: string
  severity: string
  note: string | null
  imageUrls: string[]
  /** Still open from an earlier visit: drawn grey, confirmed or cleared. */
  previous: boolean
  /** Drawn on this job, so the app may move, change or remove it. */
  editable: boolean
  recordedAt: string
}

export interface CheckinSheet {
  body: BodyType
  /** The size of the whole sheet in drawing units; each view sits in its box. */
  width: number
  height: number
  /** How a view's 0..VIEW_SIZE box maps onto the sheet: [a, b, c, d, e, f]. */
  viewSize: number
  views: {
    view: string
    label: string
    box: { x: number; y: number; width: number; height: number }
    transform: [number, number, number, number, number, number]
  }[]
  panels: { view: string; panel: string; name: string; d: string }[]
  lines: string[]
}

export interface Checkin {
  job: { id: string; mileage: number | null; status: string }
  vehicle: {
    id: string
    make: string
    model: string
    year: number | null
    licensePlate: string | null
    mileage: number
    /** The body chosen for the vehicle, or null when the drawing is a guess. */
    bodyType: string | null
  }
  /** automotive or marine: says whether mileage is kilometres or engine hours. */
  serviceType: string
  bodies: { key: string; name: string }[]
  sheet: CheckinSheet
  /** Every kind, hidden ones too: a mark may carry one. The picker leaves those out. */
  kinds: { key: string; name: string; shape: string; color: string; hidden: boolean }[]
  severities: { key: string; name: string }[]
  marks: CheckinMark[]
  photos: { id: string; slot: string; url: string; createdAt: string }[]
  slots: readonly string[]
}

/** The drawing for a body, placed on the sheet, named in a language. */
export async function checkinSheet(body: BodyType, locale: string): Promise<CheckinSheet> {
  const messages = await loadConditionMapMessages(locale)
  const drawing = getBodyDrawing(body)
  const composition = composeViews()
  return {
    body,
    width: composition.width,
    height: composition.height,
    viewSize: VIEW_SIZE,
    views: composition.views.map((placed) => ({
      view: placed.view,
      label: messages.views[placed.view] ?? placed.view,
      box: placed.box,
      transform: [
        placed.transform.a,
        placed.transform.b,
        placed.transform.c,
        placed.transform.d,
        placed.transform.e,
        placed.transform.f,
      ],
    })),
    panels: placedPanels(drawing, composition).map((panel) => ({
      view: panel.view,
      panel: panel.panel,
      name: messages.panels[panel.panel] ?? panel.panel,
      d: panel.d,
    })),
    lines: placedLines(drawing, composition),
  }
}

/** The job's visit, for telling its marks from earlier ones. */
export function jobScope(job: {
  id: string
  inspectionId: string | null
  createdAt: Date
}): MarkScope {
  return { serviceRecordId: job.id, linkedInspectionId: job.inspectionId, openedAt: job.createdAt }
}

/** The marks the job's map shows, numbered as the web numbers them. */
export function checkinMarks(
  all: ConditionMarkData[],
  scope: MarkScope,
  panelNames: Record<string, string>
): CheckinMark[] {
  const { own, previous } = splitMarks(all, scope)
  const ownIds = new Set(own.map((m) => m.id))
  return numberedMarks([...previous, ...own]).map((mark, index) => ({
    id: mark.id,
    number: index + 1,
    bodyType: mark.bodyType,
    view: mark.view,
    panel: mark.panel,
    panelName: panelNames[mark.panel] ?? mark.panel,
    x: mark.x,
    y: mark.y,
    kind: mark.kind,
    severity: mark.severity,
    note: mark.note,
    imageUrls: mark.imageUrls,
    previous: !ownIds.has(mark.id),
    editable: ownIds.has(mark.id) && isDrawnOnSheet(mark, scope),
    recordedAt: new Date(mark.recordedAt).toISOString(),
  }))
}

export async function loadCheckin(
  organizationId: string,
  jobId: string,
  locale: string,
  opts: { body?: string | null } = {}
): Promise<Checkin | null> {
  const job = await db.serviceRecord.findFirst({
    where: { id: jobId, organizationId },
    select: {
      id: true,
      status: true,
      mileage: true,
      inspectionId: true,
      createdAt: true,
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          mileage: true,
          bodyType: true,
        },
      },
      attachments: {
        where: { category: 'dropoff' },
        select: { id: true, description: true, fileUrl: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!job?.vehicle) return null
  const vehicle = job.vehicle

  const [serviceTypeRow, messages, kinds, marks] = await Promise.all([
    db.appSetting.findFirst({
      where: { organizationId, key: SETTING_KEYS.SERVICE_TYPE },
      select: { value: true },
    }),
    loadConditionMapMessages(locale),
    markTypeCatalogue(organizationId, locale),
    loadVehicleConditionMarks(organizationId, vehicle.id),
  ])
  const serviceType = serviceTypeRow?.value === 'marine' ? 'marine' : 'automotive'
  const body = isBodyType(opts.body) ? opts.body : bodyTypeFor(vehicle, { serviceType })

  return {
    job: { id: job.id, mileage: job.mileage, status: job.status },
    vehicle: {
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      licensePlate: vehicle.licensePlate,
      mileage: vehicle.mileage,
      bodyType: isBodyType(vehicle.bodyType) ? vehicle.bodyType : null,
    },
    serviceType,
    bodies: BODY_TYPES.map((key) => ({ key, name: messages.bodies[key] ?? key })),
    sheet: await checkinSheet(body, locale),
    kinds: kinds.map((kind) => ({
      key: kind.key,
      name: kind.name,
      shape: kind.shape,
      color: kind.color,
      hidden: kind.hidden,
    })),
    severities: (['minor', 'major'] as const).map((key) => ({
      key,
      name: messages.severities[key] ?? key,
    })),
    marks: checkinMarks(marks, jobScope(job), messages.panels),
    photos: job.attachments.map((a) => ({
      id: a.id,
      slot: isDropoffSlot(a.description) ? a.description : 'other',
      url: a.fileUrl,
      createdAt: a.createdAt.toISOString(),
    })),
    slots: DROPOFF_SLOTS,
  }
}

/** The job's marks after a change, renumbered, with panel names in a language. */
export async function checkinMarkList(
  organizationId: string,
  vehicleId: string,
  scope: MarkScope,
  locale: string
): Promise<CheckinMark[]> {
  const [all, messages] = await Promise.all([
    loadVehicleConditionMarks(organizationId, vehicleId),
    loadConditionMapMessages(locale),
  ])
  return checkinMarks(all, scope, messages.panels)
}
