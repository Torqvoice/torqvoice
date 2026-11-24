'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { Prisma } from '@/generated/prisma/client'
import { plateMatchKey } from '../Lib/vehicleIdentifiers'

/** Another vehicle with the plate being typed, as the warning names and links it. */
export interface PlateDuplicate {
  id: string
  year: number
  make: string
  model: string
  licensePlate: string | null
  customer: { id: string; name: string } | null
}

/** Enough to name which it is; the link shows the rest. */
const SHOWN = 3

const inputSchema = z.object({
  plate: z.string().max(100),
  /** The vehicle being edited, which is never a duplicate of itself. */
  excludeId: z.string().optional(),
})

/**
 * The workshop's other vehicles that carry the plate being typed, so the
 * form can say so before a second record for one vehicle is made. It only
 * reads: a plate moves to another vehicle when one is sold or re-plated,
 * so the form warns and the person can save anyway.
 *
 * Plates compare without case and without the spaces, dots and hyphens
 * people group them with: "AB 12-345" is "ab12345".
 */
export async function findVehiclesWithPlate(input: unknown) {
  return withAuth(
    async ({ organizationId }): Promise<PlateDuplicate[]> => {
      const { plate, excludeId } = inputSchema.parse(input)
      const key = plateMatchKey(plate)
      if (key.length < 2) return []
      const notSelf = excludeId ? Prisma.sql`AND v.id <> ${excludeId}` : Prisma.empty
      const hits = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT v.id
        FROM "public"."vehicles" v
        WHERE v."organizationId" = ${organizationId} ${notSelf}
          AND upper(regexp_replace(v."licensePlate", '[[:space:].-]+', '', 'g')) = ${key}
        ORDER BY v."updatedAt" DESC
        LIMIT ${SHOWN}
      `)
      if (hits.length === 0) return []
      const vehicles = await db.vehicle.findMany({
        where: { id: { in: hits.map((hit) => hit.id) }, organizationId },
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          licensePlate: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
      return vehicles
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}
