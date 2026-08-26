/**
 * Row shapes and row-to-job mapping for the work board.
 *
 * Kept out of the "use server" action files: those may only export async
 * functions, and the selects and mappers below are shared by all of them.
 */

import type { InspectionSelect, ServiceRecordSelect } from '@/generated/prisma/models'
import type { WorkBoardJob } from './types'

export const VEHICLE_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  licensePlate: true,
  customer: { select: { name: true } },
} as const

export function serviceRecordToJob(sr: {
  id: string
  title: string
  status: string
  startDateTime: Date | null
  endDateTime: Date | null
  technicianId: string | null
  workBayId: string | null
  sortOrder: number
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customer: { name: string } | null
  } | null
  customer: { name: string } | null
}): WorkBoardJob {
  return {
    id: sr.id,
    type: 'serviceRecord',
    technicianId: sr.technicianId,
    workBayId: sr.workBayId,
    sortOrder: sr.sortOrder,
    title: sr.title,
    status: sr.status,
    startDateTime: sr.startDateTime?.toISOString() ?? null,
    endDateTime: sr.endDateTime?.toISOString() ?? null,
    vehicle: sr.vehicle,
    // Counter sales carry the customer directly; everything else reaches it
    // through the vehicle, so that a reassigned vehicle takes its owner along.
    customerName: sr.customer?.name ?? sr.vehicle?.customer?.name ?? null,
  }
}

export function inspectionToJob(insp: {
  id: string
  status: string
  startDateTime: Date | null
  endDateTime: Date | null
  technicianId: string | null
  workBayId: string | null
  sortOrder: number
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customer: { name: string } | null
  }
  template: { name: string }
}): WorkBoardJob {
  return {
    id: insp.id,
    type: 'inspection',
    technicianId: insp.technicianId,
    workBayId: insp.workBayId,
    sortOrder: insp.sortOrder,
    title: insp.template.name,
    status: insp.status,
    startDateTime: insp.startDateTime?.toISOString() ?? null,
    endDateTime: insp.endDateTime?.toISOString() ?? null,
    vehicle: insp.vehicle,
    customerName: insp.vehicle.customer?.name ?? null,
    templateName: insp.template.name,
  }
}

/** Everything `serviceRecordToJob` needs, in one place so the four queries that
 * return a board job cannot drift apart. */
export const SERVICE_JOB_SELECT = {
  id: true,
  title: true,
  status: true,
  customer: { select: { name: true } },
  startDateTime: true,
  endDateTime: true,
  technicianId: true,
  workBayId: true,
  sortOrder: true,
  vehicle: { select: VEHICLE_SELECT },
} satisfies ServiceRecordSelect

export const INSPECTION_JOB_SELECT = {
  id: true,
  status: true,
  startDateTime: true,
  endDateTime: true,
  technicianId: true,
  workBayId: true,
  sortOrder: true,
  vehicle: { select: VEHICLE_SELECT },
  template: { select: { name: true } },
} satisfies InspectionSelect

/** A job shows on the board once it has a lane, whichever grouping that lane
 * belongs to. Bay-only jobs are planned work too. */
export const ON_BOARD = {
  OR: [{ technicianId: { not: null } }, { workBayId: { not: null } }],
}
