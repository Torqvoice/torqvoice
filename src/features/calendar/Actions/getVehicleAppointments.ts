'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { listAppointments } from '../Lib/appointmentList.server'

/**
 * A vehicle's appointments for its page: the coming ones, then the last few,
 * so "is this car booked?" is answered without opening the calendar.
 * Reading them is reading the calendar, which follows reading jobs.
 */
export async function getVehicleAppointments(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (typeof vehicleId !== 'string' || !vehicleId) return []
      return listAppointments(
        { organizationId, vehicleId },
        { timeZone: await workshopTimeZone(organizationId), upcoming: 5, past: 3 }
      )
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
