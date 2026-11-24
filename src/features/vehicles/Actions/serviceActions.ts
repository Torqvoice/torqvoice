'use server'

import { unlinkMeterReadingsOfDeletedJobs } from '@/features/meters/Lib/jobMeterReading.server'
import { gateFleetNumber, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import { assertInvoiceHasRequiredReference } from '@/features/customer-reference/Lib/invoiceGuard.server'
import {
  assertRequiredMetersRead,
  missingRequiredMetersForNewJob,
  requiredMetersRefusal,
} from '@/features/meters/Lib/requiredMeters.server'
import {
  gateCustomerReference,
  gatePoRequired,
  isCustomerReferenceEnabled,
} from '@/features/customer-reference/Lib/referenceSetting'
import { db } from '@/lib/db'
import { concernStoryData } from '@/features/vehicles/Lib/concernStory'
import {
  readWorkshopTax,
  savedDocumentTax,
  taxFieldsForNewDocument,
  WORKSHOP_TAX_SETTING_KEYS,
} from '@/features/settings/Lib/workshopTax'
import { withTaxableLabor, withTaxableParts } from '@/lib/taxable-lines'
import {
  readWarrantyDefaults,
  WARRANTY_SETTING_KEYS,
  warrantyExpiryFor,
  warrantyFieldsForNewDocument,
} from '@/features/settings/Lib/warrantyDefaults'
import { EMPTY_WARRANTY, normalizeWarranty } from '@/lib/warranty'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'
import { withAuth } from '@/lib/with-auth'
import { parseSentFields, sentId } from '@/lib/parse-sent-fields'
import { createServiceSchema, updateServiceSchema } from '../Schema/serviceSchema'
import { revalidatePath } from 'next/cache'
import { isSystemStatus, statusColumns } from '@/features/work-order-statuses/Lib/stages'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { randomUUID } from 'crypto'
import { releaseFiles } from '@/lib/files/manager'
import { serviceRecordFileUrls } from '@/lib/files/collect'
import { clearNextNumberSetting, JOB_NUMBER_SETTING_KEYS, nextJobNumber } from '@/lib/job-number'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { endOfWorkshopDay, toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { zonedDayKey } from '@/lib/timezone'
import { serviceDateOrderBy } from '@/lib/date-sort'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'
import { assertInvoiceEditable, getDocumentLockSettings } from '@/lib/document-lock.server'
import { DocumentLockedError, invoiceLockState } from '@/lib/document-lock'
import { deleteCustomFieldValuesOf } from '@/features/custom-fields/Lib/deleteCustomFieldValues'
import { typeKeySearch } from '@/features/vehicles/Lib/typeKeySetting'
import { applyJobReading, jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'
import { writeServiceRecordUpdate } from '@/features/vehicles/Lib/writeServiceRecordUpdate.server'
import { ACTIVE_HELPERS } from '@/features/workboard/Lib/jobTeam'
import { FRESH_SHARE_LINK } from '@/lib/share-expiry'

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
          { concerns: { some: { description: { contains: params.search, mode: 'insensitive' } } } },
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
            // The first few lines of each job, so a list can say what was
            // done without anybody opening the job.
            laborItems: { take: 4, select: { description: true } },
            partItems: { take: 4, select: { name: true } },
            // The workshop's own status, drawn beside the stage in the lists.
            customStatus: { select: { name: true, color: true } },
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
          ...(await typeKeySearch(organizationId, params.search)).map((vehicle) => ({ vehicle })),
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
          concerns: {
            orderBy: { sortOrder: 'asc' },
            include: { confirmedBy: { select: { name: true } } },
          },
          partItems: true,
          laborItems: true,
          attachments: true,
          payments: { orderBy: { date: 'desc' } },
          // Who opened the job, for the line under its number.
          createdBy: { select: { name: true } },
          // Who is on the job besides its technician.
          helpers: ACTIVE_HELPERS,
          // The inspection it was raised from, for the link beside it: the
          // photos of what is being repaired live there.
          inspection: {
            select: { id: true, createdAt: true, template: { select: { name: true } } },
          },
          // The workshop's own status, archived or not: a job keeps saying
          // what it was called after the status has left the menus.
          customStatus: { select: { id: true, name: true, color: true, stage: true } },
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
              invoiceDesignId: true,
              customerNumber: true,
              taxId: true,
              taxExempt: true,
              reminderOptOut: true,
              poRequired: true,
              notes: true,
              createdAt: true,
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
              // Whose reading the vehicle's is: the reading field's notices.
              readingJobId: true,
              readingBeforeJob: true,
              // The facts card's "More info": what the desk would otherwise
              // open the vehicle page to read (and copy) mid-job.
              color: true,
              fuelType: true,
              transmission: true,
              engineSize: true,
              engineCode: true,
              hsn: true,
              tsn: true,
              fleetNumber: true,
              purchaseDate: true,
              purchasePrice: true,
              inspectionStatus: {
                select: { dueAt: true, lastAt: true, source: true, registered: true },
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
                  invoiceDesignId: true,
                  customerNumber: true,
                  taxId: true,
                  taxExempt: true,
                  reminderOptOut: true,
                  poRequired: true,
                  notes: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      })
      if (!record) return record

      // The quotes that became this job, for the links beside its number: the
      // one it was raised from and any added to it since. Oldest first, the
      // order they reached the job in.
      const quotes = await db.quote.findMany({
        where: { organizationId, convertedToId: record.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, quoteNumber: true, title: true },
      })

      // Without the customer's reference / PO, and without "PO required" on
      // its customer, for a workshop that has the field off: the page has no
      // box and no notice for them, so they are not sent there either.
      const referenceOn = await isCustomerReferenceEnabled(organizationId)
      return {
        ...gateCustomerReference(record, referenceOn),
        customer: record.customer && gatePoRequired(record.customer, referenceOn),
        // And without the vehicle's fleet number where that is switched off.
        vehicle: record.vehicle && {
          ...gateFleetNumber(record.vehicle, await isFleetNumberEnabled(organizationId)),
          customer: record.vehicle.customer && gatePoRequired(record.vehicle.customer, referenceOn),
        },
        quotes,
      }
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
      const timeZone = await workshopTimeZone(organizationId)

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
      // Made completed straight away: a job that does not exist yet has no
      // reading of the vehicle's required meters, so it is refused, naming
      // them. Made open, it is completed once they are read.
      if (data.status === 'completed' && vehicle) {
        const missing = await missingRequiredMetersForNewJob(organizationId, vehicle.id)
        if (missing.length > 0) throw await requiredMetersRefusal('complete', missing)
      }

      // Auto-populate shop name and invoice prefix from settings
      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: {
              in: [
                ...JOB_NUMBER_SETTING_KEYS,
                ...WORKSHOP_TAX_SETTING_KEYS,
                ...WARRANTY_SETTING_KEYS,
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

      // If the caller didn't pass taxInclusive, inherit the org's current setting.
      // Existing callers (vehicle-detail-client, ServiceForm) don't send the field,
      // so they pick up the workshop default; explicit values are respected.
      const inputObj = (input ?? {}) as Record<string, unknown>
      const taxInclusive =
        'taxInclusive' in inputObj
          ? data.taxInclusive
          : settingsMap['workshop.taxInclusive'] === 'true'

      // Tax-exempt customer: force taxRate to 0 (overrides whatever the caller sent).
      const customerExempt = Boolean(vehicle?.customer?.taxExempt || directCustomer?.taxExempt)
      if (customerExempt) {
        data.taxRate = 0
        data.taxAmount = 0
      }

      // A job at the workshop's own rate carries its tax components, so a
      // split-tax workshop's invoice prints GST and QST apart from the start.
      // A rate the caller set by hand is one figure and stays one.
      const workshopTax = readWorkshopTax(settingsMap)
      const atWorkshopRate =
        !customerExempt && data.taxRate > 0 && data.taxRate === workshopTax.rate
      // Each line is stored saying whether it is taxed: what the caller chose
      // for it, or the workshop's rule for its kind. The tax is then the
      // server's to state whenever the lines decide it (see savedDocumentTax).
      const taxedParts = withTaxableParts(data.partItems ?? [], workshopTax.applies)
      const taxedLabor = withTaxableLabor(data.laborItems ?? [], workshopTax.applies)
      const savedTax = savedDocumentTax({
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        taxRate: data.taxRate,
        taxInclusive,
        taxComponents: atWorkshopRate ? taxFieldsForNewDocument(workshopTax).taxComponents : null,
        parts: taxedParts,
        labor: taxedLabor,
      })

      // The next number in the workshop's format; see src/lib/job-number.ts.
      const { invoiceNumber, usesNextNumberSetting } = await nextJobNumber({
        organizationId,
        settings: settingsMap,
        timeZone,
      })

      const {
        concerns,
        partItems,
        laborItems,
        attachments,
        serviceDate,
        invoiceDate,
        invoiceDueDate,
        warrantyStatus,
        warrantyMonths,
        warrantyMileage,
        warrantyNotes,
        ...recordData
      } = data

      // A caller that says nothing about warranty gets the workshop's standing
      // answer, as a job opened from the board does; one that says anything is
      // taken at its word. Counter sales are not repairs and start empty.
      const warrantyUnstated =
        warrantyStatus === undefined &&
        warrantyMonths === undefined &&
        warrantyMileage === undefined &&
        warrantyNotes === undefined
      const warranty = !warrantyUnstated
        ? normalizeWarranty({ warrantyStatus, warrantyMonths, warrantyMileage, warrantyNotes })
        : data.vehicleId
          ? warrantyFieldsForNewDocument(readWarrantyDefaults(settingsMap), 'workOrder')
          : EMPTY_WARRANTY
      const startsAt = toSafeWorkshopDate(serviceDate, timeZone) ?? new Date()
      const warrantyStartsOn = startsAt

      const record = await db.$transaction(async (tx) => {
        const created = await tx.serviceRecord.create({
          data: {
            ...recordData,
            organizationId,
            createdById: userId,
            // Only vehicle-less records link a customer directly; vehicle-linked
            // records always resolve their customer through the vehicle.
            customerId: data.vehicleId ? null : data.customerId,
            taxInclusive,
            ...(savedTax.totals
              ? {
                  taxComponents: savedTax.totals.taxComponents,
                  taxAmount: savedTax.totals.taxAmount,
                  totalAmount: savedTax.totals.totalAmount,
                }
              : {}),
            taxableSubtotal: savedTax.taxableSubtotal,
            shopName,
            invoiceNumber,
            serviceDate: startsAt,
            // Reports and the calendar find a job by when it started; a job
            // without a start is in none of them.
            startDateTime: startsAt,
            // Only a date somebody chose. Without one the invoice is dated
            // the day it is issued (invoiceDateAtIssue), not the day the job
            // was opened.
            invoiceDate: toSafeWorkshopDate(invoiceDate, timeZone) ?? null,
            invoiceDueDate: toSafeWorkshopDate(invoiceDueDate, timeZone),
            ...warranty,
            warrantyExpiresAt: warrantyExpiryFor(warranty, warrantyStartsOn, timeZone),
          },
        })
        // Spent only once the job is written, in the same transaction.
        if (usesNextNumberSetting) await clearNextNumberSetting(organizationId, tx)

        if (partItems && partItems.length > 0) {
          // Enrich parts with unitCost from inventory (stock movement is handled
          // by reconcileInventoryForParts below).
          const enrichedParts = []
          for (const p of taxedParts) {
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
              category: p.category ?? null,
              unitPrice: p.unitPrice,
              total: p.total,
              unitCost: resolvedUnitCost,
              markupPercent: p.markupPercent ?? 0,
              inventoryPartId: p.inventoryPartId || null,
              taxable: p.taxable,
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

        if (concerns && concerns.length > 0) {
          const now = new Date()
          await tx.serviceConcern.createMany({
            data: concerns.map((concern, index) => ({
              description: concern.description,
              sortOrder: concern.sortOrder ?? index,
              serviceRecordId: created.id,
              ...concernStoryData(concern, null, userId, now),
            })),
          })
        }

        if (laborItems && laborItems.length > 0) {
          await tx.serviceLabor.createMany({
            data: taxedLabor.map((l) => ({
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

      // A new job resets maintenance dismissed, and its reading may become the
      // vehicle's: the rule is in vehicleReading.ts.
      if (vehicle) {
        await db.vehicle.update({
          where: { id: vehicle.id },
          data: { maintenanceDismissed: false, maintenanceDismissedAt: null },
        })
        await db.$transaction((tx) =>
          applyJobReading(tx, {
            organizationId,
            vehicleId: vehicle.id,
            jobId: record.id,
            jobDate: jobReadingDate(record),
            reading: data.mileage,
          })
        )
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
      // Refused before anything is read or written: this is the main way the
      // money on an invoice changes. Before the input is parsed too, so a
      // locked invoice says it is locked whatever the form sent with it.
      const recordId = sentId(input)
      if (recordId) await assertInvoiceEditable(recordId, organizationId)
      // Only what was sent: see parseSentFields for what the defaults did.
      const data = parseSentFields(updateServiceSchema, input)
      // The whole form, money and all, as a page sends it that was opened
      // before saveServiceRecordChanges existed. The page now sends only what
      // it edited, to that action.
      return writeServiceRecordUpdate({ userId, organizationId }, data)
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

/**
 * Moves a job along. `customStatusId` names one of the workshop's own
 * statuses, which has to sit under the stage being moved to; without one the
 * job stands at the plain stage and lets go of whatever status it carried,
 * since that belonged to the stage it left. See work-order-statuses/Lib/stages.
 */
export async function updateServiceStatus(
  recordId: string,
  status: string,
  customStatusId: string | null = null
) {
  return withAuth(
    async ({ organizationId }) => {
      // Written as it arrived until now; every screen that reads it keeps a
      // closed list, so a stray value made the job vanish from half of them.
      if (!isSystemStatus(status)) throw new Error('Unknown status')
      const custom = customStatusId
        ? await db.workOrderStatus.findFirst({
            where: { id: customStatusId, organizationId, archivedAt: null },
            select: { id: true, name: true, stage: true },
          })
        : null
      if (customStatusId && !custom) throw new Error('Status not found')
      if (custom && custom.stage !== status) {
        throw new Error('That status belongs to another stage')
      }

      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        include: {
          vehicle: {
            select: { id: true, make: true, model: true, year: true, licensePlate: true },
          },
        },
      })
      if (!record) throw new Error('Record not found')
      if (status === 'completed' && record.status !== 'completed') {
        await assertRequiredMetersRead(organizationId, record.id, 'complete')
      }

      await db.serviceRecord.update({
        where: { id: recordId },
        data: statusColumns(status, custom),
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
      return { success: true, recordId, status, customStatus: custom?.name ?? null }
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
        metadata: {
          serviceRecordId: result.recordId,
          status: result.status,
          ...(result.customStatus ? { customStatus: result.customStatus } : {}),
        },
      }),
    }
  )
}

/**
 * Saves the job's internal notes on their own. The work order's Save goes
 * through updateServiceRecord, which refuses a locked invoice outright; the
 * internal notes are not part of what the lock freezes (they are never printed
 * or shared), so a locked job still takes them through here.
 */
export async function updateInternalNotes(recordId: string, html: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (typeof html !== 'string' || html.length > 200_000) throw new Error('Invalid notes')
      const notes = html
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, invoiceNumber: true, vehicleId: true },
      })
      if (!record) throw new Error('Record not found')

      await db.serviceRecord.update({
        where: { id: record.id },
        // The editor reports an emptied box as one empty paragraph.
        data: { diagnosticNotes: notes && notes !== '<p></p>' ? notes : null },
      })

      if (record.vehicleId) revalidatePath(`/vehicles/${record.vehicleId}`)
      else revalidatePath(`/sales/${record.id}`)
      return { id: record.id, invoiceNumber: record.invoiceNumber }
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
        metadata: { serviceRecordId: result.id, field: 'diagnosticNotes' },
      }),
    }
  )
}

/**
 * Renames a job the moment the title field is left.
 *
 * The title used to travel with the rest of the form on the autosave five
 * seconds later, and a rename followed by the back arrow inside those
 * seconds was lost. It is one column, so it goes straight to the row.
 */
export async function updateServiceRecordTitle(recordId: string, title: string) {
  return withAuth(
    async ({ organizationId }) => {
      const next = typeof title === 'string' ? title.trim() : ''
      if (!next || next.length > 200) throw new Error('Invalid title')
      await assertInvoiceEditable(recordId, organizationId)
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, invoiceNumber: true, vehicleId: true },
      })
      if (!record) throw new Error('Record not found')

      await db.serviceRecord.update({ where: { id: record.id }, data: { title: next } })

      revalidatePath('/work-orders')
      if (record.vehicleId) revalidatePath(`/vehicles/${record.vehicleId}`)
      else revalidatePath(`/sales/${record.id}`)
      return { id: record.id, invoiceNumber: record.invoiceNumber, title: next }
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
        metadata: { serviceRecordId: result.id, field: 'title' },
      }),
    }
  )
}

export async function toggleManuallyPaid(recordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
        include: { payments: { select: { amount: true } } },
      })
      if (!record) throw new Error('Record not found')

      // Marking paid is always allowed — it only ever locks the document
      // further. But a flip that would *release* the lock is the admin-only
      // unlock in disguise: without this check, anyone with edit permission
      // could unmark a locked invoice, rewrite it, and mark it paid again,
      // leaving no unlock in the audit trail.
      const settings = await getDocumentLockSettings(organizationId)
      const before = invoiceLockState(record, settings)
      const after = invoiceLockState({ ...record, manuallyPaid: !record.manuallyPaid }, settings)
      if (before.locked && !after.locked && before.reason) {
        throw new DocumentLockedError(before.reason)
      }

      await db.serviceRecord.update({
        where: { id: recordId },
        // The day goes with the mark: a share link set to expire "after
        // payment" counts from it.
        data: {
          manuallyPaid: !record.manuallyPaid,
          manuallyPaidAt: record.manuallyPaid ? null : new Date(),
        },
      })
      // A paid invoice is the customer's document whether or not it was ever
      // sent through the app.
      if (!record.manuallyPaid) await issueInvoice(recordId, organizationId, 'paid')

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
  /** 'today': what the workshop owes a customer by the end of today. */
  due?: string
}) {
  return withAuth(
    async ({ organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId }
      const referenceOn = await isCustomerReferenceEnabled(organizationId)

      // Promised to a customer for today or earlier, and not handed over.
      // Anything already late belongs to the same answer: it was due before
      // today and is still owed. "Today" is the workshop's own day, not the
      // server's, or a shop an hour ahead loses its evening.
      if (params.due === 'today') {
        const timeZone = await workshopTimeZone(organizationId)
        const endOfToday = endOfWorkshopDay(zonedDayKey(new Date(), timeZone), timeZone)
        if (endOfToday) {
          where.promisedAt = { not: null, lte: endOfToday }
          where.AND = [...(where.AND ?? []), { status: { not: 'completed' } }]
        }
      }

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
          ...(await typeKeySearch(organizationId, params.search)).map((vehicle) => ({ vehicle })),
          { vehicle: { customer: { name: { contains: params.search, mode: 'insensitive' } } } },
          { customer: { name: { contains: params.search, mode: 'insensitive' } } },
          // The customer's reference / PO, for a workshop that uses the field.
          ...(referenceOn
            ? [{ customerReference: { contains: params.search, mode: 'insensitive' } }]
            : []),
        ]
      }

      const [records, total, statusCounts] = await Promise.all([
        db.serviceRecord.findMany({
          where,
          include: {
            // The workshop's own status, shown beside the stage in the list.
            customStatus: { select: { name: true, color: true } },
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
              // What the customer was told. A job with no promise made sorts
              // last either way: it is not late, and it is not "soonest".
              case 'promisedAt':
                return {
                  promisedAt: { sort: dir, nulls: 'last' as const },
                }
              // When the job itself was last saved, newest first by default.
              case 'updatedAt':
                return { updatedAt: dir }
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
        records: records.map((record) => gateCustomerReference(record, referenceOn)),
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
      // A locked invoice cannot be edited into nothing either.
      await assertInvoiceEditable(recordId, organizationId)
      const record = await db.serviceRecord.findFirst({
        where: { id: recordId, organizationId },
      })
      if (!record) throw new Error('Record not found')

      // Its attachments and status report videos, read now and let go once
      // the record is gone. A tire set's photo on this job is shared with the
      // set and stays, as does anything else still in use.
      const files = await serviceRecordFileUrls(organizationId, [recordId])

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
        // Its meter readings stay in the history, at the date they count at now.
        await unlinkMeterReadingsOfDeletedJobs(tx, { organizationId, jobIds: [recordId] })
        await tx.serviceRecord.delete({ where: { id: recordId } })
        // Its custom field values hang on its id alone, so nothing cascades.
        await deleteCustomFieldValuesOf(tx, organizationId, 'service_record', [recordId])
      })
      await releaseFiles(files, { organizationId, reason: 'work order deleted' })

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

      await db.serviceAttachment.delete({ where: { id: attachmentId } })

      // Then the file, unless something still uses it: a tire hotel copy points
      // at the tire set's own upload, which the set keeps; a photo sent on
      // WhatsApp stays for the conversation.
      await releaseFiles([attachment.fileUrl], { organizationId, reason: 'attachment deleted' })

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
      // A customer who needs their PO on the invoice does not get one without it.
      await assertInvoiceHasRequiredReference(organizationId, serviceRecordId)
      // Nor before the readings the workshop requires are on the job.
      await assertRequiredMetersRead(organizationId, serviceRecordId, 'share')

      // The link is a way of sending the invoice, so what it shows is frozen
      // now, before the stamp below locks it.
      await issueInvoice(serviceRecordId, organizationId, 'sent')

      const token = randomUUID()
      await db.serviceRecord.update({
        where: { id: serviceRecordId },
        data: {
          publicToken: token,
          sharedAt: new Date(),
          ...FRESH_SHARE_LINK,
          // Handing over a link is a way of sending the invoice, so it counts
          // for "lock when sent". Unlike sharedAt this is never cleared:
          // revoking the link does not unsend what the customer already saw.
          // It tracks the latest share, so re-sharing after an unlock locks
          // the document again. Kept inline (rather than markInvoiceSent,
          // which owns every other channel) so the token and the stamp land
          // in one write.
          sentAt: new Date(),
        },
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
        data: {
          publicToken: null,
          sharedAt: null,
          viewCount: 0,
          lastViewedAt: null,
          ...FRESH_SHARE_LINK,
        },
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
