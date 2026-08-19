'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { calculateTotals } from '@/lib/tax'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  agreementSchema,
  invoiceChargeSchema,
  updateAgreementSchema,
} from '../Schema/tireHotelSchema'
import {
  duePeriods,
  parseExtras,
  periodAmount,
  round2,
  type InvoiceTarget,
  type StorageBillingModel,
} from '../Lib/billing'
import { requireTireHotel } from '../Lib/tireHotelSettings'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL }]
const UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.TIRE_HOTEL }]
/** Raising an invoice is a billing act, so it needs billing rights too. */
const BILL = [
  { action: PermissionAction.UPDATE, subject: PermissionSubject.TIRE_HOTEL },
  { action: PermissionAction.CREATE, subject: PermissionSubject.BILLING },
]

function revalidateBilling(tireSetId?: string) {
  revalidatePath('/tire-hotel')
  if (tireSetId) revalidatePath(`/tire-hotel/${tireSetId}`)
  revalidatePath('/billing')
}

async function invoiceTargetFor(organizationId: string): Promise<InvoiceTarget> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: { organizationId, key: SETTING_KEYS.TIRE_HOTEL_INVOICE_TARGET },
    },
    select: { value: true },
  })
  return setting?.value === 'workOrder' ? 'workOrder' : 'separate'
}

/**
 * Creates the charge rows for every period that has fallen due but has none.
 *
 * Driven by what is already recorded rather than a cursor on the agreement,
 * so running it twice, or late after downtime, still bills each period once.
 */
async function syncCharges(
  tx: Prisma.TransactionClient,
  agreementId: string,
  organizationId: string
): Promise<number> {
  const agreement = await tx.tireStorageAgreement.findFirst({
    where: { id: agreementId, organizationId },
    include: { charges: { select: { periodStart: true } } },
  })
  if (!agreement) return 0

  const extras = parseExtras(agreement.extras)
  const amount = periodAmount(agreement.price, extras)

  const due = duePeriods(
    agreement,
    agreement.charges.map((c) => c.periodStart),
    new Date()
  )
  if (due.length === 0) return 0

  await tx.tireStorageCharge.createMany({
    data: due.map((period) => ({
      agreementId: agreement.id,
      organizationId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      amount,
      status: 'pending',
    })),
    skipDuplicates: true,
  })

  return due.length
}

export async function getAgreementsForSet(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      return db.tireStorageAgreement.findMany({
        where: { tireSetId, organizationId },
        orderBy: { startDate: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          charges: {
            orderBy: { periodStart: 'desc' },
            include: {
              serviceRecord: {
                select: { id: true, invoiceNumber: true, status: true, totalAmount: true },
              },
            },
          },
        },
      })
    },
    { requiredPermissions: READ }
  )
}

export async function createAgreement(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = agreementSchema.parse(input)

      const created = await db.$transaction(async (tx) => {
        const set = await tx.tireSet.findFirst({
          where: { id: data.tireSetId, organizationId },
          select: { id: true, reference: true, customerId: true },
        })
        if (!set) throw new Error('Tire set not found')

        // One live agreement per set: two would each raise charges for the
        // same shelf space and quietly double-bill the customer.
        const existing = await tx.tireStorageAgreement.findFirst({
          where: { tireSetId: set.id, organizationId, status: 'active' },
          select: { id: true },
        })
        if (existing) {
          throw new Error('This set already has an active agreement. End it before adding another.')
        }

        const agreement = await tx.tireStorageAgreement.create({
          data: {
            tireSetId: set.id,
            customerId: data.customerId ?? set.customerId ?? null,
            billingModel: data.billingModel,
            price: round2(data.price),
            extras: data.extras?.length ? data.extras : undefined,
            startDate: data.startDate,
            endDate: data.endDate ?? null,
            autoRenew: data.autoRenew ?? false,
            status: 'active',
            notes: data.notes || null,
            organizationId,
            userId,
          },
        })

        const created = await syncCharges(tx, agreement.id, organizationId)
        return { ...agreement, reference: set.reference, chargesCreated: created }
      })

      revalidateBilling(data.tireSetId)
      return created
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_agreement.create',
        message: `Created storage agreement for tire set ${result.reference ?? result.tireSetId}`,
        metadata: { agreementId: result.id, price: result.price },
      }),
    }
  )
}

export async function updateAgreement(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const { id, ...data } = updateAgreementSchema.parse(input)

      const updated = await db.$transaction(async (tx) => {
        const existing = await tx.tireStorageAgreement.findFirst({
          where: { id, organizationId },
          include: { tireSet: { select: { id: true, reference: true } } },
        })
        if (!existing) throw new Error('Agreement not found')

        const agreement = await tx.tireStorageAgreement.update({
          where: { id },
          data: {
            ...(data.customerId !== undefined ? { customerId: data.customerId || null } : {}),
            ...(data.billingModel !== undefined ? { billingModel: data.billingModel } : {}),
            ...(data.price !== undefined ? { price: round2(data.price) } : {}),
            ...(data.extras !== undefined
              ? { extras: data.extras.length ? data.extras : undefined }
              : {}),
            ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
            ...(data.endDate !== undefined ? { endDate: data.endDate ?? null } : {}),
            ...(data.autoRenew !== undefined ? { autoRenew: data.autoRenew } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
          },
        })

        // Repricing only moves periods nobody has billed yet. An invoiced
        // period is a document the customer already has.
        if (data.price !== undefined || data.extras !== undefined) {
          const extras = parseExtras(agreement.extras)
          await tx.tireStorageCharge.updateMany({
            where: { agreementId: id, status: 'pending' },
            data: { amount: periodAmount(agreement.price, extras) },
          })
        }

        return {
          ...agreement,
          reference: existing.tireSet.reference,
          tireSetId: existing.tireSet.id,
        }
      })

      revalidateBilling(updated.tireSetId)
      return updated
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_agreement.update',
        message: `Updated storage agreement for tire set ${result.reference ?? result.tireSetId}`,
        metadata: { agreementId: result.id },
      }),
    }
  )
}

/**
 * Stops an agreement without touching what it has already billed. Pending
 * periods go with it, since nobody owes for a season that will not happen.
 */
export async function endAgreement(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const result = await db.$transaction(async (tx) => {
        const agreement = await tx.tireStorageAgreement.findFirst({
          where: { id, organizationId },
          include: { tireSet: { select: { id: true, reference: true } } },
        })
        if (!agreement) throw new Error('Agreement not found')

        const waived = await tx.tireStorageCharge.updateMany({
          where: { agreementId: id, status: 'pending' },
          data: { status: 'waived' },
        })

        await tx.tireStorageAgreement.update({
          where: { id },
          data: { status: 'ended', endDate: agreement.endDate ?? new Date(), autoRenew: false },
        })

        return {
          id,
          reference: agreement.tireSet.reference,
          tireSetId: agreement.tireSet.id,
          waived: waived.count,
        }
      })

      revalidateBilling(result.tireSetId)
      return result
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_agreement.end',
        message: `Ended storage agreement for tire set ${result.reference ?? result.tireSetId}`,
        metadata: { agreementId: result.id, waivedCharges: result.waived },
      }),
    }
  )
}

/** Brings an agreement's charge rows up to date without waiting for a sweep. */
export async function refreshCharges(agreementId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const created = await db.$transaction((tx) => syncCharges(tx, agreementId, organizationId))
      const agreement = await db.tireStorageAgreement.findFirst({
        where: { id: agreementId, organizationId },
        select: { tireSetId: true },
      })

      revalidateBilling(agreement?.tireSetId)
      return { created }
    },
    { requiredPermissions: UPDATE }
  )
}

/**
 * Puts one due period onto an invoice.
 *
 * Where it lands follows the organization's setting: `separate` raises a
 * dedicated invoice, `workOrder` appends to an open job for the same vehicle
 * so the customer pays once. `workOrder` falls back to a separate invoice
 * when there is no open job to append to, because refusing to bill would be
 * a worse answer than billing on its own document.
 */
export async function invoiceCharge(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = invoiceChargeSchema.parse(input)

      const result = await db.$transaction(async (tx) => {
        const charge = await tx.tireStorageCharge.findFirst({
          where: { id: data.chargeId, organizationId },
          include: {
            agreement: {
              include: {
                customer: { select: { id: true, taxExempt: true } },
                tireSet: {
                  select: {
                    id: true,
                    reference: true,
                    season: true,
                    size: true,
                    quantity: true,
                    vehicleId: true,
                  },
                },
              },
            },
          },
        })
        if (!charge) throw new Error('Charge not found')
        if (charge.status === 'invoiced') throw new Error('This period is already invoiced')

        const { agreement } = charge
        const { tireSet } = agreement

        // Reuse the job the caller named, otherwise follow the setting.
        let record = data.serviceRecordId
          ? await tx.serviceRecord.findFirst({
              where: { id: data.serviceRecordId, organizationId },
              select: { id: true, invoiceNumber: true },
            })
          : null

        if (
          !record &&
          (await invoiceTargetFor(organizationId)) === 'workOrder' &&
          tireSet.vehicleId
        ) {
          record = await tx.serviceRecord.findFirst({
            where: {
              organizationId,
              vehicleId: tireSet.vehicleId,
              status: { in: ['pending', 'in_progress'] },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, invoiceNumber: true },
          })
        }

        if (!record) {
          const created = await createDraftRecord(
            { organizationId, userId },
            {
              vehicleId: null,
              customerId: agreement.customerId,
              customerExempt: agreement.customer?.taxExempt ?? false,
              title: `Tire storage${tireSet.reference ? ` #${tireSet.reference}` : ''}`,
            }
          )
          record = { id: created.id, invoiceNumber: created.invoiceNumber }
        }

        // Storage is a flat service line, not hours: one unit at the period
        // price, so it prints as a single figure on the invoice.
        const description = [
          'Tire storage',
          tireSet.size,
          `${tireSet.quantity} pcs`,
          formatPeriod(charge.periodStart, charge.periodEnd),
        ]
          .filter(Boolean)
          .join(' · ')

        await tx.serviceLabor.create({
          data: {
            serviceRecordId: record.id,
            description,
            hours: 1,
            rate: charge.amount,
            total: charge.amount,
            pricingType: 'service',
          },
        })

        await recalculateRecord(tx, record.id)

        await tx.tireStorageCharge.update({
          where: { id: charge.id },
          data: { status: 'invoiced', serviceRecordId: record.id, invoicedAt: new Date() },
        })

        return {
          chargeId: charge.id,
          serviceRecordId: record.id,
          invoiceNumber: record.invoiceNumber,
          amount: charge.amount,
          tireSetId: tireSet.id,
          reference: tireSet.reference,
        }
      })

      revalidateBilling(result.tireSetId)
      revalidatePath(`/vehicles/service/${result.serviceRecordId}`)
      return result
    },
    {
      requiredPermissions: BILL,
      audit: ({ result }) => ({
        action: 'tire_agreement.invoice',
        entity: 'ServiceRecord',
        entityId: result.serviceRecordId,
        message: `Invoiced tire storage for set ${result.reference ?? result.tireSetId} on ${result.invoiceNumber ?? result.serviceRecordId}`,
        metadata: { chargeId: result.chargeId, amount: result.amount },
      }),
    }
  )
}

/** Drops a period without billing it, e.g. a goodwill season. */
export async function waiveCharge(chargeId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const charge = await db.tireStorageCharge.findFirst({
        where: { id: chargeId, organizationId },
        include: { agreement: { select: { tireSetId: true } } },
      })
      if (!charge) throw new Error('Charge not found')
      if (charge.status === 'invoiced') {
        throw new Error('This period is already invoiced. Credit the invoice instead.')
      }

      await db.tireStorageCharge.update({ where: { id: chargeId }, data: { status: 'waived' } })
      revalidateBilling(charge.agreement.tireSetId)
      return { id: chargeId, tireSetId: charge.agreement.tireSetId }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_agreement.waive',
        message: 'Waived a tire storage period',
        metadata: { chargeId: result.id },
      }),
    }
  )
}

function formatPeriod(start: Date, end: Date): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return `${iso(start)} - ${iso(end)}`
}

/**
 * Re-totals a record from its line items, using the same helper and the same
 * discount rules as adding a part does. Rolling our own arithmetic here would
 * let a storage line and a parts line disagree about what inclusive tax means.
 */
async function recalculateRecord(tx: Prisma.TransactionClient, serviceRecordId: string) {
  const record = await tx.serviceRecord.findUnique({
    where: { id: serviceRecordId },
    select: { discountType: true, discountValue: true, taxRate: true, taxInclusive: true },
  })
  if (!record) return

  const [partsAgg, laborAgg] = await Promise.all([
    tx.servicePart.aggregate({ where: { serviceRecordId }, _sum: { total: true } }),
    tx.serviceLabor.aggregate({ where: { serviceRecordId }, _sum: { total: true } }),
  ])

  const subtotal = (partsAgg._sum.total || 0) + (laborAgg._sum.total || 0)
  const discountAmount =
    record.discountType === 'percentage'
      ? subtotal * ((record.discountValue ?? 0) / 100)
      : record.discountType === 'fixed'
        ? Math.min(record.discountValue ?? 0, subtotal)
        : 0

  const { taxAmount, totalAmount } = calculateTotals({
    subtotal,
    discountAmount,
    taxRate: record.taxRate,
    taxInclusive: record.taxInclusive,
  })

  await tx.serviceRecord.update({
    where: { id: serviceRecordId },
    data: { subtotal, taxAmount, totalAmount },
  })
}
