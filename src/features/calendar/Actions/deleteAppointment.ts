'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * Takes an appointment off the calendar, with its notifications. A booked
 * job is not an appointment: it is cancelled or deleted as a work order.
 */
export async function deleteAppointment(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const appointmentId = z.string().min(1).parse(id)
      const appointment = await db.appointment.findFirst({
        where: { id: appointmentId, organizationId },
        select: { id: true, title: true },
      })
      if (!appointment) throw new Error('Appointment not found')
      await db.appointment.delete({ where: { id: appointment.id } })
      return appointment
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'appointment.delete',
        entity: 'Appointment',
        entityId: result.id,
        details: { key: 'appointment_delete', params: { title: result.title } },
      }),
    }
  )
}
