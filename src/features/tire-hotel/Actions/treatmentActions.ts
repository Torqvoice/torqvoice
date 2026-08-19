'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { TREATMENT_STATUSES, TREATMENT_TYPES } from '../Lib/treatments'
import { requireTireHotel } from '../Lib/tireHotelSettings'

const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.TIRE_HOTEL }]

const setTreatmentsSchema = z.object({
  tireSetId: z.string().min(1),
  types: z.array(z.enum(TREATMENT_TYPES)).max(TREATMENT_TYPES.length),
})

const markTreatmentSchema = z.object({
  id: z.string().min(1),
  status: z.enum(TREATMENT_STATUSES),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})

function revalidateSet(tireSetId: string) {
  revalidatePath('/tire-hotel')
  revalidatePath(`/tire-hotel/${tireSetId}`)
}

/**
 * Replaces the list of work a set needs.
 *
 * Rows already finished survive being unticked: removing a wash from the list
 * should not erase the record that someone washed them. Only outstanding work
 * is actually deleted.
 */
export async function setTreatments(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const data = setTreatmentsSchema.parse(input)

      const result = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({
          where: { id: data.tireSetId, organizationId },
          select: { id: true, reference: true },
        })
        if (!set) throw new Error('Tire set not found')

        const existing = await tx.tireTreatment.findMany({
          where: { tireSetId: set.id },
          select: { id: true, type: true, status: true },
        })

        const wanted = new Set<string>(data.types)
        const settled = new Set(existing.filter((t) => t.status !== 'pending').map((t) => t.type))

        const toDelete = existing.filter((t) => t.status === 'pending' && !wanted.has(t.type))
        const toCreate = data.types.filter((type) => !existing.some((t) => t.type === type))

        if (toDelete.length > 0) {
          await tx.tireTreatment.deleteMany({ where: { id: { in: toDelete.map((t) => t.id) } } })
        }
        if (toCreate.length > 0) {
          await tx.tireTreatment.createMany({
            data: toCreate.map((type) => ({
              type,
              status: 'pending',
              tireSetId: set.id,
              organizationId,
            })),
            skipDuplicates: true,
          })
        }

        return {
          id: set.id,
          reference: set.reference,
          added: toCreate.length,
          removed: toDelete.length,
          keptSettled: settled.size,
        }
      })

      revalidateSet(data.tireSetId)
      return result
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_treatment.update',
        message: `Updated prep work on tire set ${result.reference ?? result.id}`,
        metadata: { added: result.added, removed: result.removed },
      }),
    }
  )
}

/** Ticks one job off, or puts it back. */
export async function markTreatment(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = markTreatmentSchema.parse(input)

      const treatment = await db.tireTreatment.findFirst({
        where: { id: data.id, organizationId },
        include: { tireSet: { select: { id: true, reference: true } } },
      })
      if (!treatment) throw new Error('Treatment not found')

      const done = data.status === 'done'
      const updated = await db.tireTreatment.update({
        where: { id: data.id },
        data: {
          status: data.status,
          // Un-ticking clears the credit as well as the state, so the record
          // never claims someone finished work that is back on the list.
          completedAt: done ? new Date() : null,
          completedById: done ? userId : null,
          ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        },
      })

      revalidateSet(treatment.tireSet.id)
      return {
        ...updated,
        reference: treatment.tireSet.reference,
        tireSetId: treatment.tireSet.id,
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_treatment.mark',
        message: `Marked ${result.type} as ${result.status} on tire set ${result.reference ?? result.tireSetId}`,
        metadata: { treatmentId: result.id },
      }),
    }
  )
}

/** Ticks off everything still outstanding on a set, for a finished job. */
export async function completeAllTreatments(tireSetId: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)

      const set = await db.tireSet.findFirst({
        where: { id: tireSetId, organizationId },
        select: { id: true, reference: true },
      })
      if (!set) throw new Error('Tire set not found')

      const { count } = await db.tireTreatment.updateMany({
        where: { tireSetId: set.id, status: 'pending' },
        data: { status: 'done', completedAt: new Date(), completedById: userId },
      })

      revalidateSet(set.id)
      return { id: set.id, reference: set.reference, count }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_treatment.complete_all',
        message: `Completed ${result.count} prep job(s) on tire set ${result.reference ?? result.id}`,
      }),
    }
  )
}
