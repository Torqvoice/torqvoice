'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createDraftRecord } from '../Lib/createDraftRecord'

export async function createDraftServiceRecord(
  vehicleId: string,
  startDateTime?: Date,
  endDateTime?: Date,
  technicianId?: string
) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        include: { customer: { select: { taxExempt: true } } },
      })
      if (!vehicle) throw new Error('Vehicle not found')

      return createDraftRecord(
        { organizationId, userId },
        {
          vehicleId,
          customerId: null,
          customerExempt: vehicle.customer?.taxExempt ?? false,
          title: 'New Service Record',
          startDateTime,
          endDateTime,
          technicianId,
        }
      )
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.CREATE,
          subject: PermissionSubject.SERVICES,
        },
      ],
      audit: ({ result }) => ({
        action: 'service.create',
        entity: 'ServiceRecord',
        entityId: result.id,
        message: `Created draft service record ${result.invoiceNumber || result.id}`,
        metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

export async function createDraftCounterSale(customerId: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true, taxExempt: true },
      })
      if (!customer) throw new Error('Customer not found')

      return createDraftRecord(
        { organizationId, userId },
        {
          vehicleId: null,
          customerId: customer.id,
          customerExempt: customer.taxExempt,
          title: 'Parts Sale',
        }
      )
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.CREATE,
          subject: PermissionSubject.SERVICES,
        },
      ],
      audit: ({ result }) => ({
        action: 'service.create',
        entity: 'ServiceRecord',
        entityId: result.id,
        message: `Created counter sale ${result.invoiceNumber || result.id}`,
        metadata: { serviceRecordId: result.id, customerId: result.customerId },
      }),
    }
  )
}
