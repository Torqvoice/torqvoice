'use server'

import { ATTENTION_STATUSES } from '@/features/quotes/Lib/quoteStatus'
import { assertQuoteEditable, getDocumentLockSettings } from '@/lib/document-lock.server'
import { DocumentLockedError, quoteLockState } from '@/lib/document-lock'
import { db } from '@/lib/db'
import { parseTaxComponentDefinitions } from '@/lib/tax-components'
import { documentTotals, taxComponentsForCopy } from '@/features/settings/Lib/workshopTax'
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
import { revalidatePath } from 'next/cache'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'
import { copyFile, mkdir } from 'fs/promises'
import path from 'path'
import { clearedToNull } from '@/lib/clearable'
import { uploadsRoot } from '@/lib/upload-root'
import { releaseFiles } from '@/lib/files/manager'
import { quoteFileUrls } from '@/lib/files/collect'

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
      return quote
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

      // Get settings for invoice number
      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: { in: ['workshop.invoicePrefix', ...WARRANTY_SETTING_KEYS] },
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

        const includedParts = quote.partItems.filter((p) => !p.excluded)
        if (includedParts.length > 0) {
          await tx.servicePart.createMany({
            data: includedParts.map((p) => ({
              partNumber: p.partNumber,
              name: p.name,
              quantity: p.quantity,
              unit: p.unit,
              unitCost: p.unitCost,
              markupPercent: p.markupPercent,
              unitPrice: p.unitPrice,
              total: p.total,
              // Preserve the stock link so the job — and any later edit or
              // deletion of it — reconciles against the right inventory item.
              inventoryPartId: p.inventoryPartId,
              serviceRecordId: created.id,
            })),
          })

          // The quote itself never moved stock (it is only an estimate). The
          // conversion is the point of consumption, so deduct here — exactly
          // once, inside the same transaction that creates the job.
          await reconcileInventoryForParts(tx, organizationId, [], includedParts, {
            reason: 'quote_conversion',
            userId,
            serviceRecordId: created.id,
            serviceRecordLabel: created.invoiceNumber || created.title,
            note: `Converted from quote ${quote.quoteNumber ?? quote.id}`,
          })
        }

        const includedLabor = quote.laborItems.filter((l) => !l.excluded)
        if (includedLabor.length > 0) {
          await tx.serviceLabor.createMany({
            data: includedLabor.map((l) => ({
              description: l.description,
              hours: l.hours,
              rate: l.rate,
              total: l.total,
              pricingType: l.pricingType || 'hourly',
              serviceRecordId: created.id,
            })),
          })
        }

        // Copy attachments from quote to service record
        if (quote.attachments.length > 0) {
          const quotesDir = path.join(uploadsRoot(), organizationId, 'quotes')
          // Where every other upload goes. This used to be a fixed
          // `data/uploads`, so with DATA_ROOT set the copies landed where the
          // file route never looks and the job showed broken images.
          const servicesDir = path.join(uploadsRoot(), organizationId, 'services')
          await mkdir(servicesDir, { recursive: true })

          for (const att of quote.attachments) {
            try {
              // Extract filename from URL and build paths; only a plain name.
              const filename = att.fileUrl.split('/').pop() ?? ''
              if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) || filename.includes('..')) {
                throw new Error('not a stored file name')
              }
              const srcPath = path.join(quotesDir, filename)
              const destPath = path.join(servicesDir, filename)
              await copyFile(srcPath, destPath)

              const newUrl = att.fileUrl.replace('/quotes/', '/services/')
              await tx.serviceAttachment.create({
                data: {
                  fileName: att.fileName,
                  fileUrl: newUrl,
                  fileType: att.fileType,
                  fileSize: att.fileSize,
                  category: att.category === 'document' ? 'document' : 'image',
                  description: att.description,
                  includeInInvoice: att.includeInInvoice,
                  serviceRecordId: created.id,
                },
              })
            } catch (err) {
              console.warn(`[convertQuote] Failed to copy attachment "${att.fileName}":`, err)
            }
          }
        }

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
