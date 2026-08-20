'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import {
  agreementSchema,
  invoiceChargeSchema,
  updateAgreementSchema,
} from '../Schema/tireHotelSchema'
import { duePeriods, parseExtras, periodAmount, round2 } from '../Lib/billing'
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

/**
 * Open jobs a storage charge could be added to.
 *
 * Scoped to the paying customer and their vehicles, so the picker never
 * offers someone else's invoice. Appending to the wrong job is a mistake
 * nobody notices until the customer queries the bill.
 */
export async function getOpenInvoicesForCharge(chargeId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const charge = await db.tireStorageCharge.findFirst({
        where: { id: chargeId, organizationId },
        select: {
          agreement: {
            select: { customerId: true, tireSet: { select: { vehicleId: true } } },
          },
        },
      })
      if (!charge) throw new Error('Charge not found')

      const { customerId } = charge.agreement
      const vehicleId = charge.agreement.tireSet.vehicleId
      if (!customerId && !vehicleId) return []

      return db.serviceRecord.findMany({
        where: {
          organizationId,
          status: { in: ['pending', 'in_progress'] },
          OR: [
            ...(customerId ? [{ customerId }] : []),
            ...(vehicleId ? [{ vehicleId }] : []),
            ...(customerId ? [{ vehicle: { customerId } }] : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          serviceDate: true,
          vehicle: { select: { licensePlate: true, make: true, model: true } },
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

/**
 * Removes an agreement outright.
 *
 * Only when nothing it produced ever reached an invoice. A period that has
 * been billed is a document the customer holds, and the charge row is what
 * ties that line back to a reason, so deleting it would leave an
 * unexplained amount on a real invoice. Those agreements are ended, not
 * deleted.
 *
 * Everything else is a mistake or a trial, and a shop should be able to tidy
 * it away rather than read past it forever.
 */
export async function deleteAgreement(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const agreement = await db.tireStorageAgreement.findFirst({
        where: { id, organizationId },
        include: {
          tireSet: { select: { id: true, reference: true } },
          charges: { select: { status: true } },
        },
      })
      if (!agreement) throw new Error('Agreement not found')

      const invoiced = agreement.charges.filter((c) => c.status === 'invoiced').length
      if (invoiced > 0) {
        throw new Error(
          `This agreement has ${invoiced} invoiced period(s), so it cannot be deleted. End it instead.`
        )
      }

      await db.tireStorageAgreement.delete({ where: { id } })

      revalidateBilling(agreement.tireSet.id)
      return {
        id,
        reference: agreement.tireSet.reference,
        tireSetId: agreement.tireSet.id,
        removedCharges: agreement.charges.length,
      }
    },
    {
      requiredPermissions: UPDATE,
      audit: ({ result }) => ({
        action: 'tire_agreement.delete',
        message: `Deleted storage agreement for tire set ${result.reference ?? result.tireSetId}`,
        metadata: { agreementId: result.id, removedCharges: result.removedCharges },
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
 * The caller says where it lands, because that is a decision about this
 * customer on this day rather than a policy: someone collecting during a
 * service wants one bill, someone who only stores wants their own document,
 * and a set that belongs to a vehicle may want a job the whole shop can see.
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

        let record: { id: string; invoiceNumber: string | null } | null = null

        if (data.target === 'existing') {
          record = await tx.serviceRecord.findFirst({
            where: { id: data.serviceRecordId ?? '', organizationId },
            select: { id: true, invoiceNumber: true },
          })
          if (!record) throw new Error('That job no longer exists')
        } else {
          // A work order hangs off the vehicle, so it reaches the board, the
          // vehicle history and the technician's day. A plain invoice does
          // not, which is exactly what a storage-only customer wants.
          const asWorkOrder = data.target === 'new_work_order'
          if (asWorkOrder && !tireSet.vehicleId) {
            throw new Error('This set has no vehicle, so it cannot become a work order')
          }

          const created = await createDraftRecord(
            { organizationId, userId },
            {
              vehicleId: asWorkOrder ? tireSet.vehicleId : null,
              customerId: asWorkOrder ? null : agreement.customerId,
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

        await retotalServiceRecord(record.id, tx)

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
