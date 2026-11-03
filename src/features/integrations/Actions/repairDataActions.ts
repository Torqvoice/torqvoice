'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { publicErrorMessage } from '@/lib/public-error-message'
import { withAuth } from '@/lib/with-auth'
import {
  askRepairData,
  askRepairDataItem,
  findRepairDataConnection,
  matchVariant,
  type RepairDataItem,
  type RepairDataKind,
  sameVariant,
  type VariantMatch,
} from '../Lib/repair-data'
import { meetsConfidence, type RepairDataPrefs, readPrefs } from '../Lib/repair-prefs'
import type { RepairDataVariantRef } from '../Lib/types'
import { withinLookupBudget } from '../Lib/vehicle-lookup'

/**
 * The labor guide on work orders and quotes: book times to add as labor
 * lines, and fluid capacities to read, for the job's vehicle.
 */

const READ_VEHICLES = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

const kindSchema = z.enum(['labor', 'fluids'])

/** Ids the source hands out: slugs such as "5.0l-v8-coyote" and uuids. */
const sourceId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+$/)

const variantSchema = z.object({
  engineId: sourceId,
  drivetrain: sourceId.nullable(),
  vehicleId: sourceId.nullable(),
})

export interface RepairDataVariantOption {
  ref: RepairDataVariantRef
  /** Engine and drivetrain, such as "5.0L V8 Coyote, 4WD". */
  label: string
}

export interface RepairDataView<K extends RepairDataKind> {
  /** The connector that answered, such as "openlaborproject", for the link to its settings. */
  connector: string
  /** Source name for the attribution line. */
  source: string
  /** The source's logo under /public. */
  logo: string | null
  /** The market the values are for, as an ISO country code, such as "US". */
  region: string | null
  variants: RepairDataVariantOption[]
  /** Index into variants of the one whose items are below. */
  selected: number
  /**
   * How well the selected engine fits the vehicle on file, or "chosen" when
   * the person picked it in the dialog.
   */
  match: VariantMatch | 'chosen'
  items: RepairDataItem<K>[]
  /** Values left out because they are below the workshop's minimum confidence. */
  hidden: number
  prefs: RepairDataPrefs
}

/**
 * What a lookup came to. A source that has no such vehicle, or a key that
 * has used its calls, is an answer for the dialog to show, not an error for
 * the server log.
 */
export type RepairDataOutcome<T> =
  | { status: 'found'; value: T }
  | { status: 'none' }
  | { status: 'failed'; message: string }

function failed(err: unknown): { status: 'failed'; message: string } {
  return { status: 'failed', message: publicErrorMessage(err) }
}

/** Which parts of the labor guide to offer: plan on, and a connected source for each. */
export async function isRepairDataAvailable() {
  return withAuth(
    async ({ organizationId }): Promise<Record<RepairDataKind, boolean>> => {
      const features = await getFeatures(organizationId)
      if (!features.integrations) return { labor: false, fluids: false }
      const [labor, fluids] = await Promise.all([
        findRepairDataConnection(organizationId, 'labor'),
        findRepairDataConnection(organizationId, 'fluids'),
      ])
      return {
        labor: labor !== null,
        fluids: fluids !== null && readPrefs(fluids.settings).fluids,
      }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}

async function prepare(organizationId: string, vehicleId: string, kind: RepairDataKind) {
  const features = await getFeatures(organizationId)
  if (!features.integrations) throw new Error('Integrations are not included in your plan')
  const connection = await findRepairDataConnection(organizationId, kind)
  if (!connection) throw new Error('No labor guide is connected')
  if (kind === 'fluids' && !readPrefs(connection.settings).fluids)
    throw new Error('Fluid specs are turned off in the integration settings')
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { make: true, model: true, year: true, vin: true, engineSize: true, fuelType: true },
  })
  if (!vehicle) throw new Error('Vehicle not found')
  if (!vehicle.make.trim() || !vehicle.model.trim() || !vehicle.year)
    throw new Error('The vehicle needs a make, model and year first')
  if (!withinLookupBudget(organizationId))
    throw new Error('Too many lookups, wait a minute and try again')
  const query = {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin ?? undefined,
  }
  return { connection, vehicle, query }
}

function labelOf(engine: string, drivetrain: string | null): string {
  return drivetrain ? `${engine}, ${drivetrain.toUpperCase()}` : engine
}

/**
 * Everything the guide lists for the vehicle, for one engine and drivetrain:
 * the one asked for, else the one most like the vehicle on file.
 */
export async function getRepairData(input: {
  vehicleId: string
  kind: RepairDataKind
  variant?: RepairDataVariantRef
}) {
  return withAuth(
    async ({ organizationId }): Promise<RepairDataOutcome<RepairDataView<RepairDataKind>>> => {
      const parsed = z
        .object({
          vehicleId: z.string().min(1).max(64),
          kind: kindSchema,
          variant: variantSchema.optional(),
        })
        .parse(input)
      let looked: Awaited<ReturnType<typeof askRepairData>>
      let vehicle: Awaited<ReturnType<typeof prepare>>['vehicle']
      try {
        const prepared = await prepare(organizationId, parsed.vehicleId, parsed.kind)
        vehicle = prepared.vehicle
        looked = await askRepairData(prepared.connection.id, parsed.kind, prepared.query)
      } catch (err) {
        return failed(err)
      }
      const { answer, connector, source, logo, prefs } = looked
      if (!answer) return { status: 'none' }
      const asked = parsed.variant
        ? answer.variants.findIndex((v) => sameVariant(v, parsed.variant as RepairDataVariantRef))
        : -1
      const fit = matchVariant(answer.variants, vehicle)
      const selected = asked >= 0 ? asked : fit.index
      const all = answer.variants[selected].items
      // The minimum confidence is for labor times, the figure that is billed.
      const items =
        parsed.kind === 'labor' ? all.filter((i) => meetsConfidence(i, prefs.minConfidence)) : all
      return {
        status: 'found',
        value: {
          connector,
          source,
          logo,
          region: answer.region ?? null,
          variants: answer.variants.map((v) => ({
            ref: { engineId: v.engineId, drivetrain: v.drivetrain, vehicleId: v.vehicleId },
            label: labelOf(v.engine, v.drivetrain),
          })),
          selected,
          match: asked >= 0 ? 'chosen' : fit.match,
          items,
          hidden: all.length - items.length,
          prefs,
        },
      }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}

/**
 * What unlocking one value came to. "hidden" is a labor time the source
 * rates below the workshop's minimum confidence: a locked row has no level
 * to judge until it is shown, so the setting can only apply once it is.
 */
export type RepairDataUnlock<T> = RepairDataOutcome<T> | { status: 'hidden' }

/**
 * The value of one locked job or fluid system, for a key that unlocks them
 * one at a time.
 */
export async function unlockRepairDataItem(input: {
  vehicleId: string
  kind: RepairDataKind
  variant: RepairDataVariantRef
  item: string
}) {
  return withAuth(
    async ({ organizationId }): Promise<RepairDataUnlock<RepairDataItem<RepairDataKind>>> => {
      const parsed = z
        .object({
          vehicleId: z.string().min(1).max(64),
          kind: kindSchema,
          variant: variantSchema,
          item: sourceId,
        })
        .parse(input)
      try {
        const { connection, query } = await prepare(organizationId, parsed.vehicleId, parsed.kind)
        const item = await askRepairDataItem(connection.id, parsed.kind, {
          ...query,
          variant: parsed.variant,
          item: parsed.item,
        })
        if (!item) return { status: 'none' }
        const { minConfidence } = readPrefs(connection.settings)
        if (parsed.kind === 'labor' && !meetsConfidence(item, minConfidence)) {
          return { status: 'hidden' }
        }
        return { status: 'found', value: item }
      } catch (err) {
        return failed(err)
      }
    },
    { requiredPermissions: READ_VEHICLES }
  )
}
