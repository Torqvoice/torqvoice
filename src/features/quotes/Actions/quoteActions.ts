'use server'

import { ATTENTION_STATUSES } from '@/features/quotes/Lib/quoteStatus'
import {
  assertInvoiceEditable,
  assertQuoteEditable,
  getDocumentLockSettings,
} from '@/lib/document-lock.server'
import { DocumentLockedError, invoiceLockState, quoteLockState } from '@/lib/document-lock'
import { OPEN_SERVICE_STATUSES } from '@/lib/service-record'
import { discountAmountFor } from '@/lib/tax'
import { db } from '@/lib/db'
import { assertOwnedCustomer, assertOwnedVehicle } from '@/lib/owned-records'
import { parseTaxComponentDefinitions } from '@/lib/tax-components'
import { documentTotals, taxComponentsForCopy } from '@/features/settings/Lib/workshopTax'
import {
  isShopFeeLine,
  newShopFeeLine,
  readShopFee,
  SHOP_FEE_SETTING_KEYS,
  shopFeeFor,
} from '@/features/settings/Lib/shopFee'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import {
  readWarrantyDefaults,
  WARRANTY_SETTING_KEYS,
  warrantyExpiryFor,
  warrantyFieldsForNewDocument,
} from '@/features/settings/Lib/warrantyDefaults'
import { normalizeWarranty } from '@/lib/warranty'
import { withAuth } from '@/lib/with-auth'
import { createQuoteSchema, quoteStatusSchema, updateQuoteSchema } from '../Schema/quoteSchema'
import { createQuoteRecord } from '../Lib/createQuoteRecord'
import {
  copyQuoteAttachmentsToJob,
  copyQuoteLaborToJob,
  copyQuotePartsToJob,
} from '../Lib/copyQuoteToJob'
import { revalidatePath } from 'next/cache'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { clearedToNull } from '@/lib/clearable'
import { releaseFiles } from '@/lib/files/manager'
import { quoteFileUrls } from '@/lib/files/collect'
import { gateTypeKey, isTypeKeyEnabled } from '@/features/vehicles/Lib/typeKeySetting'

/**
 * Default valid-until for new quotes: today plus workshop.quoteValidDays
 * (30 when unset). An explicit 0 or negative disables the prefill.
 */
export async function getQuotesPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const page = params.page || 1
      const pageSize = params.pageSize || 20
      const skip = (page - 1) * pageSize

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId }

      if (params.status === 'attention') {
        where.status = { in: ATTENTION_STATUSES }
      } else if (params.status && params.status !== 'all') {
        where.status = params.status
      }

      if (params.search) {
        where.OR = [
          { title: { contains: params.search, mode: 'insensitive' } },
          { quoteNumber: { contains: params.search, mode: 'insensitive' } },
          { customer: { name: { contains: params.search, mode: 'insensitive' } } },
        ]
      }

      const [records, total, statusCounts] = await Promise.all([
        db.quote.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true } },
            vehicle: {
              select: { id: true, make: true, model: true, year: true, licensePlate: true },
            },
          },
          orderBy: (() => {
            const dir = params.sortOrder || 'desc'
            switch (params.sortBy) {
              case 'quoteNumber':
                return { quoteNumber: { sort: dir, nulls: 'last' as const } }
              case 'title':
                return { title: dir }
              case 'customer':
                return { customer: { name: dir } }
              // Column shows "year make model"; sort make, model, year so
              // identical models group together
              case 'vehicle':
                return [
                  { vehicle: { make: dir } },
                  { vehicle: { model: dir } },
                  { vehicle: { year: dir } },
                ]
              case 'status':
                return { status: dir }
              case 'totalAmount':
                return { totalAmount: dir }
              case 'createdAt':
                return { createdAt: dir }
              default:
                return { createdAt: 'desc' as const }
            }
          })(),
          skip,
          take: pageSize,
        }),
        db.quote.count({ where }),
        db.quote.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: true,
        }),
      ])

      const counts: Record<string, number> = {}
      for (const g of statusCounts) {
        counts[g.status] = g._count
      }
      counts.attention = ATTENTION_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0)

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        statusCounts: counts,
      }
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] }
  )
}

export async function getVehicleQuotes(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      return db.quote.findMany({
        where: { vehicleId, organizationId },
        select: {
          id: true,
          quoteNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          validUntil: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] }
  )
}

export async function getQuote(quoteId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
        include: {
          partItems: true,
          laborItems: true,
          attachments: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              company: true,
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
              hsn: true,
              tsn: true,
              mileage: true,
            },
          },
          inspection: {
            select: { id: true },
          },
        },
      })
      // Missing or foreign-org quote yields null rather than an error: the page
      // renders its not-found state, and this also runs during the post-delete
      // re-render of the quote route.
      if (!quote?.vehicle) return quote
      const enabled = await isTypeKeyEnabled(organizationId)
      return { ...quote, vehicle: gateTypeKey(quote.vehicle, enabled) }
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }] }
  )
}

export async function createQuote(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = createQuoteSchema.parse(input)
      const quote = await createQuoteRecord({ organizationId, userId }, data)
      revalidatePath('/quotes')
      return quote
    },
    {
      requiredPermissions: [{ action: PermissionAction.CREATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'quote.create',
        entity: 'Quote',
        entityId: result.id,
        details: { key: 'quote_create', params: { ref: result.quoteNumber || result.id } },
        metadata: { quoteId: result.id },
      }),
    }
  )
}

export async function updateQuote(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = updateQuoteSchema.parse(input)
      await assertQuoteEditable(data.id, organizationId)
      const existing = await db.quote.findFirst({
        where: { id: data.id, organizationId },
      })
      if (!existing) throw new Error('Quote not found')
      // The customer and vehicle the quote is being pointed at must be ours.
      await assertOwnedCustomer(data.customerId, organizationId)
      await assertOwnedVehicle(data.vehicleId, organizationId)

      const {
        id,
        partItems,
        laborItems,
        warrantyStatus,
        warrantyMonths,
        warrantyMileage,
        warrantyNotes,
        ...quoteData
      } = data

      // The four warranty columns move together, as on a work order: naming
      // any of them restates the whole, with the row filling in the rest.
      const warrantyTouched =
        warrantyStatus !== undefined ||
        warrantyMonths !== undefined ||
        warrantyMileage !== undefined ||
        warrantyNotes !== undefined
      const warranty = warrantyTouched
        ? normalizeWarranty({
            warrantyStatus: warrantyStatus ?? existing.warrantyStatus,
            warrantyMonths: warrantyMonths ?? existing.warrantyMonths,
            warrantyMileage: warrantyMileage ?? existing.warrantyMileage,
            warrantyNotes: warrantyNotes ?? existing.warrantyNotes,
          })
        : {}

      // Same as the work order: a quote with tax components has its split
      // recomputed from the row, since the editor sends one combined figure.
      const splitTax =
        quoteData.subtotal !== undefined && parseTaxComponentDefinitions(existing.taxComponents)
          ? documentTotals({
              subtotal: quoteData.subtotal,
              discountAmount: quoteData.discountAmount ?? existing.discountAmount,
              taxRate: existing.taxRate,
              taxInclusive: existing.taxInclusive,
              taxComponents: existing.taxComponents,
            })
          : null
      if (splitTax) {
        quoteData.taxRate = existing.taxRate
        quoteData.taxAmount = splitTax.taxAmount
        quoteData.totalAmount = splitTax.totalAmount
      }

      const quote = await db.$transaction(async (tx) => {
        const updated = await tx.quote.update({
          where: { id },
          // Fields left out of the input stay as they are; emptied ones are
          // cleared.
          data: {
            ...quoteData,
            ...warranty,
            taxComponents: splitTax?.taxComponents,
            description: clearedToNull(quoteData.description),
            notes: clearedToNull(quoteData.notes),
            customerId: clearedToNull(quoteData.customerId),
            vehicleId: clearedToNull(quoteData.vehicleId),
            validUntil:
              quoteData.validUntil !== undefined
                ? (toSafeWorkshopDate(
                    quoteData.validUntil,
                    await workshopTimeZone(organizationId)
                  ) ?? null)
                : undefined,
            discountType: quoteData.discountType === 'none' ? null : quoteData.discountType,
          },
        })

        if (partItems !== undefined) {
          await tx.quotePart.deleteMany({ where: { quoteId: id } })
          if (partItems.length > 0) {
            await tx.quotePart.createMany({
              data: partItems.map((p) => ({ ...p, quoteId: id })),
            })
          }
        }

        if (laborItems !== undefined) {
          await tx.quoteLabor.deleteMany({ where: { quoteId: id } })
          if (laborItems.length > 0) {
            await tx.quoteLabor.createMany({
              data: laborItems.map((l) => ({ ...l, quoteId: id })),
            })
          }
        }

        return updated
      })

      revalidatePath('/quotes')
      revalidatePath(`/quotes/${id}`)
      return quote
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'quote.update',
        entity: 'Quote',
        entityId: result.id,
        details: { key: 'quote_update', params: { ref: result.id } },
        metadata: { quoteId: result.id },
      }),
    }
  )
}

export async function updateQuoteStatus(quoteId: string, status: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const parsedStatus = quoteStatusSchema.parse(status)
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
      })
      if (!quote) throw new Error('Quote not found')

      // Status changes are workflow and stay open, except the ones that would
      // release the lock: the lock derives from the status, so moving an
      // accepted quote back to draft is the admin-only unlock in disguise.
      const settings = await getDocumentLockSettings(organizationId)
      const before = quoteLockState(quote, settings)
      const after = quoteLockState({ ...quote, status: parsedStatus }, settings)
      if (before.locked && !after.locked && before.reason) {
        throw new DocumentLockedError(before.reason)
      }

      await db.quote.updateMany({
        where: { id: quoteId, organizationId },
        data: { status: parsedStatus },
      })

      revalidatePath('/quotes')
      revalidatePath(`/quotes/${quoteId}`)
      return { success: true, quoteId, status }
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'quote.status',
        entity: 'Quote',
        entityId: result.quoteId,
        details: { key: 'quote_status', params: { status: result.status } },
        metadata: { quoteId: result.quoteId, status: result.status },
      }),
    }
  )
}

export async function deleteQuote(quoteId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await assertQuoteEditable(quoteId, organizationId)
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
      })
      if (!quote) throw new Error('Quote not found')

      // Its attachments cascade with it; their files are let go afterwards.
      const files = await quoteFileUrls(organizationId, [quoteId])
      await db.quote.deleteMany({ where: { id: quoteId, organizationId } })
      await releaseFiles(files, { organizationId, reason: 'quote deleted' })
      revalidatePath('/quotes')
      return { quoteId }
    },
    {
      requiredPermissions: [{ action: PermissionAction.DELETE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'quote.delete',
        entity: 'Quote',
        entityId: result.quoteId,
        details: { key: 'quote_delete', params: { ref: result.quoteId } },
        metadata: { quoteId: result.quoteId },
      }),
    }
  )
}

export async function convertQuoteToServiceRecord(quoteId: string, vehicleId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
        include: { partItems: true, laborItems: true, attachments: true },
      })
      if (!quote) throw new Error('Quote not found')

      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      })
      if (!vehicle) throw new Error('Vehicle not found')

      // The inspection the quote was raised from goes with it, so the job
      // prints its marks and its invoice carries its certificate. Only when
      // the job is for the car that was inspected.
      const inspection = quote.inspectionId
        ? await db.inspection.findFirst({
            where: { id: quote.inspectionId, organizationId, vehicleId },
            select: { id: true },
          })
        : null

      // Get settings for invoice number
      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: {
              in: ['workshop.invoicePrefix', ...WARRANTY_SETTING_KEYS, ...SHOP_FEE_SETTING_KEYS],
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
      const prefix = resolveInvoicePrefix(settingsMap['workshop.invoicePrefix'] ?? '{year}-')

      const lastRecord = await db.serviceRecord.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      })
      let nextNum = 1001
      if (lastRecord?.invoiceNumber) {
        const match = lastRecord.invoiceNumber.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1], 10) + 1
      }
      const invoiceNumber = `${prefix}${nextNum}`

      // What the customer was told on the quote is what the job carries, "not
      // included" as much as twelve months: they accepted on those words. A
      // quote that never mentioned warranty leaves the job to start like any
      // other, from the workshop's standing answer.
      const timeZone = await workshopTimeZone(organizationId)
      const serviceDate = new Date()
      const warranty = quote.warrantyStatus
        ? normalizeWarranty(quote)
        : warrantyFieldsForNewDocument(readWarrantyDefaults(settingsMap), 'workOrder')

      const record = await db.$transaction(async (tx) => {
        const created = await tx.serviceRecord.create({
          data: {
            organizationId,
            createdById: userId,
            title: quote.title,
            description: quote.description,
            type: 'repair',
            status: 'pending',
            vehicleId,
            // Carried across so a job born from a tire hotel quote still knows
            // which set it is for, and which shelf it sits on. Losing it here
            // would put the technician back to asking.
            tireSetId: quote.tireSetId,
            inspectionId: inspection?.id ?? null,
            shopName: org?.name || undefined,
            invoiceNumber,
            subtotal: quote.subtotal,
            taxComponents: taxComponentsForCopy(quote.taxComponents),
            taxRate: quote.taxRate,
            taxAmount: quote.taxAmount,
            taxInclusive: quote.taxInclusive,
            totalAmount: quote.totalAmount,
            cost: quote.totalAmount,
            discountType: quote.discountType,
            discountValue: quote.discountValue,
            discountAmount: quote.discountAmount,
            ...warranty,
            warrantyExpiresAt: warrantyExpiryFor(warranty, serviceDate, timeZone),
            serviceDate,
            startDateTime: serviceDate,
          },
        })

        const includedParts = await copyQuotePartsToJob(tx, {
          organizationId,
          userId,
          quote,
          partItems: quote.partItems,
          target: created,
        })

        const includedLabor = quote.laborItems.filter((l) => !l.excluded)
        await copyQuoteLaborToJob(tx, created.id, includedLabor)

        // A fee the workshop charges on work orders but not on quotes goes on
        // here, priced for what the customer accepted, and the job re-totalled.
        // A quote that carried the fee already brought it across above.
        const jobFee = shopFeeFor(readShopFee(settingsMap), 'workOrder')
        if (jobFee && !includedLabor.some(isShopFeeLine)) {
          const feeLine = newShopFeeLine(jobFee, {
            labor: includedLabor.reduce((sum, l) => sum + l.total, 0),
            parts: includedParts.reduce((sum, p) => sum + p.total, 0),
          })
          await tx.serviceLabor.create({ data: { ...feeLine, serviceRecordId: created.id } })
          await retotalServiceRecord(created.id, tx)
        }

        // Copy attachments from quote to service record
        await copyQuoteAttachmentsToJob(tx, organizationId, created.id, quote.attachments)

        // Mark quote as converted
        await tx.quote.updateMany({
          where: { id: quoteId, organizationId },
          data: { status: 'converted', convertedToId: created.id },
        })

        return created
      })

      revalidatePath('/quotes')
      revalidatePath('/work-orders')
      revalidatePath(`/vehicles/${vehicleId}`)
      // Conversion consumed stock for any inventory-linked quote lines.
      await onInventoryChanged(organizationId)
      return { ...record, convertedFromQuoteId: quoteId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'quote.convert',
        entity: 'Quote',
        entityId: result.convertedFromQuoteId,
        details: {
          key: 'quote_convert',
          params: { ref: result.convertedFromQuoteId, serviceRecordId: result.id },
        },
        metadata: { quoteId: result.convertedFromQuoteId, serviceRecordId: result.id },
      }),
    }
  )
}

/**
 * The jobs a quote could be added to instead of raising a new one: the chosen
 * vehicle's open work orders that still take edits. Diagnostics usually come
 * first, so by the time the quote is accepted the car already has a job, and
 * a second one would split one visit across two invoices.
 */
export async function getWorkOrdersForQuoteConversion(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (!vehicleId) return []
      const [records, lockSettings] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            organizationId,
            vehicleId,
            status: { in: [...OPEN_SERVICE_STATUSES] },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            title: true,
            invoiceNumber: true,
            status: true,
            serviceDate: true,
            sentAt: true,
            manuallyPaid: true,
            totalAmount: true,
            cost: true,
            editUnlockedAt: true,
            payments: { select: { amount: true } },
          },
        }),
        getDocumentLockSettings(organizationId),
      ])

      // A locked job would refuse the lines, so it is not offered.
      return records
        .filter((record) => !invoiceLockState(record, lockSettings).locked)
        .map((record) => ({
          id: record.id,
          title: record.title,
          invoiceNumber: record.invoiceNumber,
          status: record.status,
          serviceDate: record.serviceDate,
        }))
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

/**
 * Puts an accepted quote onto a job that already exists, in place of raising
 * a new one. The quote's lines and files are added after the job's own, which
 * are left as they are, and the job is re-totalled.
 *
 * The job keeps what it was set up with: its title, tax, warranty and shop
 * fee were decided when it was created and are not the quote's to change.
 */
export async function addQuoteToServiceRecord(
  quoteId: string,
  vehicleId: string,
  serviceRecordId: string
) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
        include: { partItems: true, laborItems: true, attachments: true },
      })
      if (!quote) throw new Error('Quote not found')
      // A second pass would put the same lines on the job twice.
      if (quote.status === 'converted') throw new Error('Quote is already converted')

      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
      })
      if (!vehicle) throw new Error('Vehicle not found')

      // Adds part and labor lines and retotals the job, so it is an edit to
      // what the invoice says it is owed and a locked one refuses it.
      await assertInvoiceEditable(serviceRecordId, organizationId)

      const record = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          vehicleId: true,
          status: true,
          inspectionId: true,
          tireSetId: true,
          discountType: true,
          discountValue: true,
        },
      })
      if (!record) throw new Error('Work order not found')
      if (record.vehicleId !== vehicleId) {
        throw new Error('That work order is for a different vehicle')
      }
      if (!(OPEN_SERVICE_STATUSES as readonly string[]).includes(record.status)) {
        throw new Error('That work order is no longer open')
      }

      // Only a job with no inspection of its own takes the quote's, and only
      // when it is for the car that was inspected.
      const inspection =
        !record.inspectionId && quote.inspectionId
          ? await db.inspection.findFirst({
              where: { id: quote.inspectionId, organizationId, vehicleId },
              select: { id: true },
            })
          : null

      // The quote's discount was part of what the customer accepted, so it
      // comes across as the amount it came to: a percentage would start
      // applying to the lines the job already had. A job with a percentage
      // discount of its own keeps it, since the two cannot both be stored.
      const jobDiscount =
        record.discountType === 'fixed' || record.discountType === 'percentage'
          ? record.discountType
          : 'none'
      const carriedDiscount =
        quote.discountAmount > 0 && jobDiscount !== 'percentage'
          ? (jobDiscount === 'fixed' ? record.discountValue : 0) + quote.discountAmount
          : null

      await db.$transaction(async (tx) => {
        // Marking it converted is what claims it: two clicks at once cannot
        // both put the lines on the job.
        const claimed = await tx.quote.updateMany({
          where: { id: quoteId, organizationId, status: { not: 'converted' } },
          data: { status: 'converted', convertedToId: record.id },
        })
        if (claimed.count === 0) throw new Error('Quote is already converted')

        await copyQuotePartsToJob(tx, {
          organizationId,
          userId,
          quote,
          partItems: quote.partItems,
          target: record,
        })

        // A job that already carries the shop fee does not get the quote's as
        // a second one; the re-total below prices the one it has. A job with
        // none takes the fee the customer accepted, and is not given the
        // workshop's default otherwise: that is applied when a job is created.
        const existingLabor = await tx.serviceLabor.findMany({
          where: { serviceRecordId: record.id },
          select: { pricingType: true },
        })
        const hasFee = existingLabor.some(isShopFeeLine)
        await copyQuoteLaborToJob(
          tx,
          record.id,
          quote.laborItems.filter((l) => !l.excluded && !(hasFee && isShopFeeLine(l)))
        )

        await copyQuoteAttachmentsToJob(tx, organizationId, record.id, quote.attachments)

        // Links the job did not have. One it has is never rewritten.
        const links = {
          ...(inspection ? { inspectionId: inspection.id } : {}),
          ...(!record.tireSetId && quote.tireSetId ? { tireSetId: quote.tireSetId } : {}),
          ...(carriedDiscount !== null
            ? { discountType: 'fixed', discountValue: carriedDiscount }
            : {}),
        }
        if (Object.keys(links).length > 0) {
          await tx.serviceRecord.update({ where: { id: record.id }, data: links })
        }

        await retotalServiceRecord(record.id, tx)

        if (carriedDiscount !== null) {
          const totals = await tx.serviceRecord.findUnique({
            where: { id: record.id },
            select: { subtotal: true },
          })
          await tx.serviceRecord.update({
            where: { id: record.id },
            data: {
              discountAmount: discountAmountFor(totals?.subtotal ?? 0, 'fixed', carriedDiscount),
            },
          })
        }
      })

      revalidatePath('/quotes')
      revalidatePath('/work-orders')
      revalidatePath(`/vehicles/${vehicleId}`)
      // Conversion consumed stock for any inventory-linked quote lines.
      await onInventoryChanged(organizationId)
      return {
        id: record.id,
        vehicleId,
        invoiceNumber: record.invoiceNumber,
        convertedFromQuoteId: quoteId,
        quoteRef: quote.quoteNumber ?? quoteId,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'quote.convert',
        entity: 'Quote',
        entityId: result.convertedFromQuoteId,
        details: {
          key: 'quote_convert_existing',
          params: { ref: result.quoteRef, jobRef: result.invoiceNumber ?? result.id },
        },
        metadata: {
          quoteId: result.convertedFromQuoteId,
          serviceRecordId: result.id,
          mergedIntoExisting: true,
        },
      }),
    }
  )
}
