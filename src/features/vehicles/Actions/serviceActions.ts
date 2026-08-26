'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { createServiceSchema, updateServiceSchema } from '../Schema/serviceSchema'
import { revalidatePath } from 'next/cache'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { resolveInvoicePrefix, toSafeDate } from '@/lib/invoice-utils'
import { serviceDateOrderBy } from '@/lib/date-sort'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'

export async function getServiceRecords(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      })
      if (!vehicle) throw new Error('Vehicle not found')

      return db.serviceRecord.findMany({
        where: { vehicleId },
        include: {
          _count: { select: { partItems: true, laborItems: true } },
        },
        orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

export async function getServiceRecordsPaginated(
  vehicleId: string,
  params: {
    page?: number
    pageSize?: number
    search?: string
    type?: string
  }
) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 10
      const skip = (page - 1) * pageSize

      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      })
      // Deleted or foreign-org vehicle: empty result instead of an error, since
      // this runs during the post-delete re-render of the vehicle page.
      if (!vehicle) {
        return { records: [], total: 0, page, pageSize, totalPages: 0 }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { vehicleId }

      if (params.search) {
        where.OR = [
          { title: { contains: params.search, mode: 'insensitive' } },
          { description: { contains: params.search, mode: 'insensitive' } },
          { diagnosticNotes: { contains: params.search, mode: 'insensitive' } },
          { techName: { contains: params.search, mode: 'insensitive' } },
          { shopName: { contains: params.search, mode: 'insensitive' } },
        ]
      }

      if (params.type && params.type !== 'all') {
        where.type = params.type
      }

      const [records, total] = await Promise.all([
        db.serviceRecord.findMany({
          where,
          include: {
            _count: { select: { partItems: true, laborItems: true, attachments: true } },
            laborItems: { take: 1, select: { description: true } },
          },
          orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
          skip,
          take: pageSize,
        }),
        db.serviceRecord.count({ where }),
      ])

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

export async function getAllServiceRecords() {
  return withAuth(
    async ({ organizationId }) => {
      return db.serviceRecord.findMany({
        where: { organizationId },
        include: {
          vehicle: { select: { make: true, model: true, year: true } },
          _count: { select: { partItems: true, laborItems: true } },
        },
        orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
        take: 50,
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

export async function getAllServiceRecordsPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  type?: string
  status?: string
}) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId }

      if (params.search) {
        where.OR = [
          { title: { contains: params.search, mode: 'insensitive' } },
          { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
          { techName: { contains: params.search, mode: 'insensitive' } },
          { vehicle: { make: { contains: params.search, mode: 'insensitive' } } },
          { vehicle: { model: { contains: params.search, mode: 'insensitive' } } },
          { vehicle: { licensePlate: { contains: params.search, mode: 'insensitive' } } },
        ]
      }

      if (params.type && params.type !== 'all') {
        where.type = params.type
      }

      if (params.status && params.status !== 'all') {
        where.status = params.status
      }

      const [records, total] = await Promise.all([
        db.serviceRecord.findMany({
          where,
          include: {
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
                customer: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
          skip,
          take: pageSize,
        }),
        db.serviceRecord.count({ where }),
      ])

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

export async function getServiceRecord(recordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        include: {
          partItems: true,
          laborItems: true,
          attachments: true,
          payments: { orderBy: { date: 'desc' } },
          // A tire job is meaningless without knowing which set and which
          // shelf, so it travels with the record rather than being fetched
          // separately by whatever screen happens to need it.
          tireSet: {
            select: {
              id: true,
              reference: true,
              season: true,
              studded: true,
              size: true,
              brand: true,
              quantity: true,
              withRims: true,
              hasTpms: true,
              status: true,
              location: { select: { code: true, warehouse: { select: { name: true } } } },
              measurements: {
                orderBy: { measuredAt: 'desc' },
                take: 8,
                // The depth too: the banner grades from the millimetres
                // rather than from the stored word.
                select: { treadDepthMm: true, condition: true },
              },
              treatments: { select: { type: true, status: true } },
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              company: true,
              telegramChatId: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              vin: true,
              licensePlate: true,
              mileage: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  address: true,
                  company: true,
                  telegramChatId: true,
                },
              },
            },
          },
        },
      })

      return record
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

export async function createServiceRecord(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = createServiceSchema.parse(input)

      // Two shapes: a vehicle-linked work order, or a counter sale (no vehicle)
      // that must be linked directly to a customer instead.
      let vehicle: { id: string; mileage: number; customer: { taxExempt: boolean } | null } | null =
        null
      let directCustomer: { id: string; taxExempt: boolean } | null = null
      if (data.vehicleId) {
        vehicle = await db.vehicle.findFirst({
          where: { id: data.vehicleId, organizationId },
          select: { id: true, mileage: true, customer: { select: { taxExempt: true } } },
        })
        if (!vehicle) throw new Error('Vehicle not found')
      } else {
        if (!data.customerId) throw new Error('A customer is required for a sale without a vehicle')
        directCustomer = await db.customer.findFirst({
          where: { id: data.customerId, organizationId },
          select: { id: true, taxExempt: true },
        })
        if (!directCustomer) throw new Error('Customer not found')
      }

      // Auto-populate shop name and invoice prefix from settings
      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: {
              in: [
                'workshop.invoicePrefix',
                'workshop.invoiceStartNumber',
                'workshop.taxInclusive',
              ],
            },
          },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
      ])
      const settingsMap: Record<string, string> = {}
      for (const s of settings) settingsMap[s.key] = s.value

      const shopName = data.shopName || org?.name || undefined
      const prefix = resolveInvoicePrefix(settingsMap['workshop.invoicePrefix'] ?? '{year}-')

      // If the caller didn't pass taxInclusive, inherit the org's current setting.
      // Existing callers (vehicle-detail-client, ServiceForm) don't send the field,
      // so they pick up the workshop default; explicit values are respected.
      const inputObj = (input ?? {}) as Record<string, unknown>
      const taxInclusive =
        'taxInclusive' in inputObj
          ? data.taxInclusive
          : settingsMap['workshop.taxInclusive'] === 'true'

      // Tax-exempt customer: force taxRate to 0 (overrides whatever the caller sent).
      if (vehicle?.customer?.taxExempt || directCustomer?.taxExempt) {
        data.taxRate = 0
        data.taxAmount = 0
      }

      // Generate sequential invoice number
      const startNumber = parseInt(settingsMap['workshop.invoiceStartNumber'] || '0', 10)
      const lastRecord = await db.serviceRecord.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      })
      let nextNum = startNumber || 1001
      if (lastRecord?.invoiceNumber) {
        const match = lastRecord.invoiceNumber.match(/(\d+)$/)
        if (match) {
          const lastNum = parseInt(match[1], 10) + 1
          nextNum = Math.max(nextNum, lastNum)
        }
      }
      const invoiceNumber = `${prefix}${nextNum}`

      // Clear start number after first use so it doesn't override future increments
      if (startNumber && nextNum === startNumber) {
        await db.appSetting.updateMany({
          where: { organizationId, key: 'workshop.invoiceStartNumber' },
          data: { value: '' },
        })
      }

      const {
        partItems,
        laborItems,
        attachments,
        serviceDate,
        invoiceDate,
        invoiceDueDate,
        warrantyMonths,
        warrantyMileage,
        warrantyNotes,
        ...recordData
      } = data

      const record = await db.$transaction(async (tx) => {
        const created = await tx.serviceRecord.create({
          data: {
            ...recordData,
            organizationId,
            // Only vehicle-less records link a customer directly; vehicle-linked
            // records always resolve their customer through the vehicle.
            customerId: data.vehicleId ? null : data.customerId,
            taxInclusive,
            shopName,
            invoiceNumber,
            serviceDate: toSafeDate(serviceDate) ?? new Date(),
            invoiceDate: toSafeDate(invoiceDate) ?? toSafeDate(serviceDate) ?? new Date(),
            invoiceDueDate: toSafeDate(invoiceDueDate),
            warrantyMonths: warrantyMonths || null,
            warrantyMileage: warrantyMileage || null,
            warrantyNotes: warrantyNotes || null,
            warrantyExpiresAt: warrantyMonths
              ? (() => {
                  const base = new Date(serviceDate || Date.now())
                  base.setMonth(base.getMonth() + warrantyMonths)
                  return base
                })()
              : null,
          },
        })

        if (partItems && partItems.length > 0) {
          // Enrich parts with unitCost from inventory (stock movement is handled
          // by reconcileInventoryForParts below).
          const enrichedParts = []
          for (const p of partItems) {
            let resolvedUnitCost = p.unitCost ?? 0
            if (p.inventoryPartId) {
              const invPart = await tx.inventoryPart.findFirst({
                where: { id: p.inventoryPartId, organizationId },
              })
              if (invPart) {
                resolvedUnitCost = invPart.unitCost ?? resolvedUnitCost
              }
            }
            enrichedParts.push({
              partNumber: p.partNumber,
              name: p.name,
              quantity: p.quantity,
              unit: p.unit ?? null,
              unitPrice: p.unitPrice,
              total: p.total,
              unitCost: resolvedUnitCost,
              markupPercent: p.markupPercent ?? 0,
              inventoryPartId: p.inventoryPartId || null,
              serviceRecordId: created.id,
            })
          }

          await tx.servicePart.createMany({ data: enrichedParts })

          // Deduct stock for inventory-linked parts (delta from an empty set).
          await reconcileInventoryForParts(tx, organizationId, [], partItems, {
            reason: 'service_record',
            userId,
            serviceRecordId: created.id,
            serviceRecordLabel: created.invoiceNumber || created.title,
          })
        }

        if (laborItems && laborItems.length > 0) {
          await tx.serviceLabor.createMany({
            data: laborItems.map((l) => ({
              ...l,
              serviceRecordId: created.id,
            })),
          })
        }

        if (attachments && attachments.length > 0) {
          await tx.serviceAttachment.createMany({
            data: attachments.map((a) => ({
              ...a,
              serviceRecordId: created.id,
            })),
          })
        }

        return created
      })

      // Revalidate inventory if any parts were sourced from inventory
      const hasInventoryParts = partItems?.some((p) => p.inventoryPartId)
      if (hasInventoryParts) {
        await onInventoryChanged(organizationId)
      }

      // Update vehicle mileage if service mileage is higher, and reset maintenance dismissed
      if (vehicle) {
        const vehicleUpdate: {
          mileage?: number
          maintenanceDismissed: boolean
          maintenanceDismissedAt: null
        } = {
          maintenanceDismissed: false,
          maintenanceDismissedAt: null,
        }
        if (data.mileage && data.mileage > vehicle.mileage) {
          vehicleUpdate.mileage = data.mileage
        }
        await db.vehicle.update({
          where: { id: vehicle.id },
          data: vehicleUpdate,
        })
      }

      revalidatePath('/')
      if (data.vehicleId) revalidatePath(`/vehicles/${data.vehicleId}`)
      revalidatePath('/services')
      return record
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.create',
        entity: 'ServiceRecord',
        entityId: result.id,
        details: { key: 'service_create', params: { ref: result.invoiceNumber || result.id } },
        metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

export async function updateServiceRecord(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = updateServiceSchema.parse(input)
      const existing = await db.serviceRecord.findFirst({
        where: { id: data.id, organizationId },
        include: {
          attachments: { select: { fileUrl: true, category: true } },
          vehicle: {
            select: {
              id: true,
              mileage: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
          },
        },
      })
      if (!existing) throw new Error('Service record not found')

      const {
        id,
        partItems,
        laborItems,
        attachments,
        customerId: _cid,
        serviceDate: _sd,
        invoiceDate: _id,
        invoiceDueDate: _idd,
        warrantyMonths: _wm,
        warrantyMileage: _wmil,
        warrantyNotes: _wn,
        ...recordData
      } = data

      // A null vehicleId from the client means "no vehicle" (counter sale) —
      // treat it as no-change rather than detaching an existing vehicle.
      if (recordData.vehicleId == null) {
        delete recordData.vehicleId
      } else if (recordData.vehicleId !== existing.vehicleId) {
        // Moving the record to another vehicle: it must belong to this org, and
        // the record's customer then follows the vehicle again.
        const targetVehicle = await db.vehicle.findFirst({
          where: { id: recordData.vehicleId, organizationId },
          select: { id: true },
        })
        if (!targetVehicle) throw new Error('Vehicle not found')
      }

      // Determine which categories are being replaced and which files were removed
      let removedFileUrls: string[] = []
      let categoriesToReplace: string[] = []
      if (attachments !== undefined) {
        categoriesToReplace = [...new Set(attachments.map((a) => a.category || 'diagnostic'))]
        const existingInCategories = existing.attachments.filter((a) =>
          categoriesToReplace.includes(a.category)
        )
        const newFileUrls = new Set(attachments.map((a) => a.fileUrl))
        removedFileUrls = existingInCategories
          .map((a) => a.fileUrl)
          .filter((url) => !newFileUrls.has(url))
      }

      const record = await db.$transaction(async (tx) => {
        const updated = await tx.serviceRecord.update({
          where: { id },
          data: {
            ...recordData,
            // Attaching a vehicle to a counter sale: the direct customer link is
            // cleared so the invoice follows the vehicle's customer again.
            customerId:
              recordData.vehicleId &&
              recordData.vehicleId !== existing.vehicleId &&
              existing.customerId
                ? null
                : undefined,
            description:
              recordData.description !== undefined ? recordData.description || null : undefined,
            techName: recordData.techName !== undefined ? recordData.techName || null : undefined,
            diagnosticNotes:
              recordData.diagnosticNotes !== undefined
                ? recordData.diagnosticNotes || null
                : undefined,
            invoiceNotes:
              recordData.invoiceNotes !== undefined ? recordData.invoiceNotes || null : undefined,
            invoiceNumber:
              recordData.invoiceNumber !== undefined ? recordData.invoiceNumber || null : undefined,
            mileage: recordData.mileage !== undefined ? (recordData.mileage ?? null) : undefined,
            serviceDate: toSafeDate(data.serviceDate),
            invoiceDate: toSafeDate(data.invoiceDate),
            invoiceDueDate: toSafeDate(data.invoiceDueDate),
            warrantyMonths:
              data.warrantyMonths !== undefined ? data.warrantyMonths || null : undefined,
            warrantyMileage:
              data.warrantyMileage !== undefined ? data.warrantyMileage || null : undefined,
            warrantyNotes:
              data.warrantyNotes !== undefined ? data.warrantyNotes || null : undefined,
            warrantyExpiresAt:
              data.warrantyMonths !== undefined
                ? data.warrantyMonths
                  ? (() => {
                      const serviceDate = data.serviceDate || existing.serviceDate
                      const base = new Date(serviceDate)
                      base.setMonth(base.getMonth() + data.warrantyMonths)
                      return base
                    })()
                  : null
                : undefined,
          },
        })

        // Replace parts if provided
        if (partItems !== undefined) {
          // Snapshot the parts being replaced BEFORE deleting them, so inventory
          // can be reconciled by the delta between the old and new linked parts
          // (this is what keeps stock correct when parts are added, edited,
          // reduced or removed on an existing work order).
          const previousParts = await tx.servicePart.findMany({
            where: { serviceRecordId: id },
            select: { inventoryPartId: true, quantity: true },
          })

          await tx.servicePart.deleteMany({ where: { serviceRecordId: id } })
          if (partItems.length > 0) {
            await tx.servicePart.createMany({
              data: partItems.map((p) => ({
                partNumber: p.partNumber,
                name: p.name,
                quantity: p.quantity,
                unit: p.unit ?? null,
                unitPrice: p.unitPrice,
                total: p.total,
                unitCost: p.unitCost ?? 0,
                markupPercent: p.markupPercent ?? 0,
                inventoryPartId: p.inventoryPartId || null,
                serviceRecordId: id,
              })),
            })
          }

          await reconcileInventoryForParts(tx, organizationId, previousParts, partItems, {
            reason: 'service_record',
            userId,
            serviceRecordId: id,
            serviceRecordLabel: existing.invoiceNumber || existing.title,
          })
        }

        // Replace labor if provided
        if (laborItems !== undefined) {
          await tx.serviceLabor.deleteMany({ where: { serviceRecordId: id } })
          if (laborItems.length > 0) {
            await tx.serviceLabor.createMany({
              data: laborItems.map((l) => ({
                ...l,
                serviceRecordId: id,
              })),
            })
          }
        }

        // Replace attachments if provided (only for the categories included in the payload)
        if (attachments !== undefined) {
          if (categoriesToReplace.length > 0) {
            await tx.serviceAttachment.deleteMany({
              where: { serviceRecordId: id, category: { in: categoriesToReplace } },
            })
          }
          if (attachments.length > 0) {
            await tx.serviceAttachment.createMany({
              data: attachments.map((a) => ({
                ...a,
                serviceRecordId: id,
              })),
            })
          }
        }

        return updated
      })

      // Update vehicle mileage if this is the latest service record and mileage is higher
      if (existing.vehicle && recordData.mileage && recordData.mileage > existing.vehicle.mileage) {
        const latestRecord = await db.serviceRecord.findFirst({
          where: { vehicleId: existing.vehicle.id },
          orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
          select: { id: true },
        })
        if (latestRecord?.id === id) {
          await db.vehicle.update({
            where: { id: existing.vehicle.id },
            data: { mileage: recordData.mileage },
          })
        }
      }

      // Delete removed attachment files from disk (after successful DB transaction)
      for (const fileUrl of removedFileUrls) {
        try {
          await unlink(resolveUploadPath(fileUrl))
        } catch (err) {
          console.warn(`[updateServiceRecord] Failed to delete file "${fileUrl}":`, err)
        }
      }

      // Notify workboard if status changed
      if (record.status !== existing.status) {
        notificationBus.emit('workboard', {
          type: 'job_status_changed',
          organizationId,
          serviceRecordId: id,
          status: record.status,
          serviceRecord: {
            id: existing.id,
            title: record.title || existing.title,
            status: record.status,
            vehicle: existing.vehicle,
          },
        })
      }

      revalidatePath('/')
      if (existing.vehicleId) {
        revalidatePath(`/vehicles/${existing.vehicleId}`)
        revalidatePath(`/vehicles/${existing.vehicleId}/service/${id}`)
      } else {
        revalidatePath(`/sales/${id}`)
      }
      revalidatePath('/services')
      // Parts may have been added, changed or removed on this record.
      await onInventoryChanged(organizationId)
      return record
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.update',
        entity: 'ServiceRecord',
        entityId: result.id,
        details: { key: 'service_update', params: { ref: result.invoiceNumber || result.id } },
        metadata: { serviceRecordId: result.id },
      }),
    }
  )
}

export async function updateServiceStatus(recordId: string, status: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        include: {
          vehicle: {
            select: { id: true, make: true, model: true, year: true, licensePlate: true },
          },
        },
      })
      if (!record) throw new Error('Record not found')

      await db.serviceRecord.update({
        where: { id: recordId },
        data: { status },
      })

      notificationBus.emit('workboard', {
        type: 'job_status_changed',
        organizationId,
        serviceRecordId: recordId,
        status,
        serviceRecord: {
          id: record.id,
          title: record.title,
          status,
          vehicle: record.vehicle,
        },
      })

      revalidatePath('/')
      revalidatePath('/work-orders')
      revalidatePath('/services')
      if (record.vehicleId) revalidatePath(`/vehicles/${record.vehicleId}`)
      else revalidatePath(`/sales/${recordId}`)
      return { success: true, recordId, status }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.status',
        entity: 'ServiceRecord',
        entityId: result.recordId,
        // ICU select selectors cannot contain a hyphen, and the stored
        // statuses do: in-progress, waiting-parts.
        details: {
          key: 'service_status',
          params: { status: result.status.replaceAll('-', '_') },
        },
        metadata: { serviceRecordId: result.recordId, status: result.status },
      }),
    }
  )
}

export async function toggleManuallyPaid(recordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
      })
      if (!record) throw new Error('Record not found')

      await db.serviceRecord.update({
        where: { id: recordId },
        data: { manuallyPaid: !record.manuallyPaid },
      })

      revalidatePath('/')
      revalidatePath('/services')
      if (record.vehicleId) {
        revalidatePath(`/vehicles/${record.vehicleId}`)
        revalidatePath(`/vehicles/${record.vehicleId}/service/${recordId}`)
      } else {
        revalidatePath(`/sales/${recordId}`)
      }
      return { success: true, manuallyPaid: !record.manuallyPaid }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

export async function getWorkOrders(params: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId }

      if (params.status === 'active') {
        where.status = { not: 'completed' }
      } else if (params.status && params.status !== 'all') {
        where.status = params.status
      }

      if (params.search) {
        where.OR = [
          { title: { contains: params.search, mode: 'insensitive' } },
          { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
          { techName: { contains: params.search, mode: 'insensitive' } },
          { vehicle: { licensePlate: { contains: params.search, mode: 'insensitive' } } },
          { vehicle: { customer: { name: { contains: params.search, mode: 'insensitive' } } } },
          { customer: { name: { contains: params.search, mode: 'insensitive' } } },
        ]
      }

      const [records, total, statusCounts] = await Promise.all([
        db.serviceRecord.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true, email: true, phone: true } },
            vehicle: {
              select: {
                id: true,
                make: true,
                model: true,
                year: true,
                licensePlate: true,
                customer: { select: { id: true, name: true, email: true, phone: true } },
              },
            },
          },
          orderBy: (() => {
            const dir = params.sortOrder || 'desc'
            switch (params.sortBy) {
              case 'invoiceNumber':
                return { invoiceNumber: dir }
              case 'title':
                return { title: dir }
              case 'status':
                return { status: dir }
              case 'techName':
                return { techName: dir }
              case 'totalAmount':
                return { totalAmount: dir }
              // Column shows "year make model"; sort make, model, year so
              // identical models group together
              case 'vehicle':
                return [
                  { vehicle: { make: dir } },
                  { vehicle: { model: dir } },
                  { vehicle: { year: dir } },
                ]
              case 'customer':
                return { vehicle: { customer: { name: dir } } }
              case 'serviceDate':
              default:
                return serviceDateOrderBy(dir)
            }
          })(),
          skip,
          take: pageSize,
        }),
        db.serviceRecord.count({ where }),
        db.serviceRecord.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: true,
        }),
      ])

      const counts: Record<string, number> = {}
      for (const g of statusCounts) {
        counts[g.status] = g._count
      }

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        statusCounts: counts,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}

export async function deleteServiceRecord(recordId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        include: { attachments: true },
      })
      if (!record) throw new Error('Record not found')

      // Clean up attachment files from disk
      for (const attachment of record.attachments) {
        const filePath = resolveUploadPath(attachment.fileUrl)
        try {
          await unlink(filePath)
        } catch (err) {
          console.warn(`[deleteServiceRecord] Failed to delete file "${filePath}":`, err)
        }
      }

      // Restock any inventory-linked parts, then delete the record (its parts
      // cascade-delete). Both happen in one transaction so stock is only
      // returned if the delete actually commits.
      await db.$transaction(async (tx) => {
        const parts = await tx.servicePart.findMany({
          where: { serviceRecordId: recordId },
          select: { inventoryPartId: true, quantity: true },
        })
        await reconcileInventoryForParts(tx, organizationId, parts, [], {
          reason: 'service_record_deleted',
          userId,
          // Deliberately no serviceRecordId: the record is deleted in this same
          // transaction, so the FK would immediately null out. The label is what
          // preserves "this stock came back from job X".
          serviceRecordLabel: record.invoiceNumber || record.title,
        })
        await tx.serviceRecord.delete({ where: { id: recordId } })
      })

      revalidatePath('/')
      if (record.vehicleId) revalidatePath(`/vehicles/${record.vehicleId}`)
      revalidatePath('/services')
      // Deleting the record restocked its linked parts.
      await onInventoryChanged(organizationId)
      return { recordId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.delete',
        entity: 'ServiceRecord',
        entityId: result.recordId,
        details: { key: 'service_delete', params: { ref: result.recordId } },
        metadata: { serviceRecordId: result.recordId },
      }),
    }
  )
}

export async function deleteServiceAttachment(attachmentId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const attachment = await db.serviceAttachment.findFirst({
        where: { id: attachmentId, serviceRecord: { organizationId } },
        include: { serviceRecord: { select: { vehicleId: true, id: true } } },
      })
      if (!attachment) throw new Error('Attachment not found')

      // Delete file from disk
      const filePath = resolveUploadPath(attachment.fileUrl)
      try {
        await unlink(filePath)
      } catch (err) {
        console.warn(`[deleteServiceAttachment] Failed to delete file "${filePath}":`, err)
      }

      await db.serviceAttachment.delete({ where: { id: attachmentId } })

      const { vehicleId, id: serviceId } = attachment.serviceRecord
      revalidatePath(
        vehicleId ? `/vehicles/${vehicleId}/service/${serviceId}` : `/sales/${serviceId}`
      )
      return { deleted: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

export async function generatePublicLink(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
      })
      if (!record) throw new Error('Record not found')

      const token = randomUUID()
      await db.serviceRecord.update({
        where: { id: serviceRecordId },
        data: { publicToken: token, sharedAt: new Date() },
      })

      revalidatePath(
        record.vehicleId
          ? `/vehicles/${record.vehicleId}/service/${serviceRecordId}`
          : `/sales/${serviceRecordId}`
      )
      return { token, organizationId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}

export async function revokePublicLink(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
      })
      if (!record) throw new Error('Record not found')

      await db.serviceRecord.update({
        where: { id: serviceRecordId },
        data: { publicToken: null, sharedAt: null, viewCount: 0, lastViewedAt: null },
      })

      revalidatePath(`/vehicles/${record.vehicleId}/service/${serviceRecordId}`)
      return { revoked: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
