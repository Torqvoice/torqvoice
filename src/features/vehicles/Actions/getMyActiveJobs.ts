'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

export interface MyActiveJob {
  id: string
  title: string
  status: string
  vehicleId: string | null
  vehicle: {
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  customer: {
    id: string
    name: string
    email: string | null
    phone: string | null
    telegramChatId: string | null
  } | null
  imageCount: number
  videoCount: number
  partCount: number
}

export async function getMyActiveJobs() {
  return withAuth(
    async ({ userId, organizationId }) => {
      // Find technician records linked to this user
      const myTechnicians = await db.technician.findMany({
        where: { organizationId, userId, isActive: true },
        select: { id: true },
      })

      if (myTechnicians.length === 0) return []

      const techIds = myTechnicians.map((t) => t.id)

      const records = await db.serviceRecord.findMany({
        where: {
          organizationId,
          status: { in: ['in-progress', 'pending', 'waiting-parts'] },
          technicianId: { in: techIds },
        },
        select: {
          id: true,
          title: true,
          status: true,
          vehicleId: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              telegramChatId: true,
            },
          },
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  telegramChatId: true,
                },
              },
            },
          },
          attachments: {
            select: { category: true },
          },
          _count: {
            select: {
              partItems: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      })

      return records.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        vehicleId: r.vehicleId,
        vehicle: r.vehicle
          ? {
              make: r.vehicle.make,
              model: r.vehicle.model,
              year: r.vehicle.year,
              licensePlate: r.vehicle.licensePlate,
            }
          : null,
        customer: r.customer ?? r.vehicle?.customer ?? null,
        imageCount: r.attachments.filter((a) => a.category === 'image').length,
        videoCount: r.attachments.filter((a) => a.category === 'video').length,
        partCount: r._count.partItems,
      }))
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
