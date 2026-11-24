import { unlinkJobMeterReadingsFromOtherVehicles } from '@/features/meters/Lib/jobMeterReading.server'
import { assertRequiredMetersRead } from '@/features/meters/Lib/requiredMeters.server'
import { db } from '@/lib/db'
import { concernStoryData } from '@/features/vehicles/Lib/concernStory'
import { savedDocumentTax } from '@/features/settings/Lib/workshopTax'
import { loadTaxApplies } from '@/features/settings/Lib/loadTaxApplies'
import { withTaxableLabor, withTaxableParts } from '@/lib/taxable-lines'
import { warrantyExpiryFor } from '@/features/settings/Lib/warrantyDefaults'
import { normalizeWarranty } from '@/lib/warranty'
import { parseTaxComponentDefinitions } from '@/lib/tax-components'
import { revalidatePath } from 'next/cache'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { releaseFiles } from '@/lib/files/manager'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { notificationBus } from '@/lib/notification-bus'
import { reconcileInventoryForParts } from '@/features/inventory/Lib/reconcileStock'
import {
  applyJobReading,
  forgetJobReading,
  jobReadingDate,
  lockJobReading,
} from '@/features/vehicles/Lib/vehicleReading'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import type { UpdateServiceInput } from '../Schema/serviceSchema'

/**
 * Writes an update of a work order: the fields in `data`, and only those.
 * The caller has checked the lock and parsed the input (parseSentFields), so
 * a field left out of `data` is a field left as it is.
 *
 * Two callers. updateServiceRecord takes the page's whole form, money and all,
 * as it always has: a tab opened before a deploy still sends that. And
 * saveServiceRecordChanges takes only what one tab edited, with no money at
 * all: `retotal` then works the totals out here from the lines and the
 * discount and tax as they are stored once this save is written, because a
 * tab that changed only the discount cannot know the lines another tab saved.
 */
export async function writeServiceRecordUpdate(
  { userId, organizationId }: { userId: string; organizationId: string },
  data: UpdateServiceInput,
  options: { retotal?: boolean } = {}
) {
  const timeZone = await workshopTimeZone(organizationId)
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
  // A save that leaves the job completed asks for its required meters
  // first, on the vehicle it will be on, when it completes the job or
  // moves a completed one to another vehicle; nothing of the save is
  // written without them. Any other save is never asked.
  const vehicleAfter = data.vehicleId !== undefined ? data.vehicleId : existing.vehicleId
  const statusAfter = data.status ?? existing.status
  if (
    statusAfter === 'completed' &&
    (existing.status !== 'completed' || vehicleAfter !== existing.vehicleId)
  ) {
    await assertRequiredMetersRead(
      organizationId,
      existing.id,
      existing.status === 'completed' ? 'move' : 'complete',
      { vehicleId: vehicleAfter }
    )
  }

  const {
    id,
    partItems,
    laborItems,
    concerns,
    attachments,
    customerId: _cid,
    serviceDate: _sd,
    invoiceDate: _id,
    invoiceDueDate: _idd,
    warrantyStatus: _ws,
    warrantyMonths: _wm,
    warrantyMileage: _wmil,
    warrantyNotes: _wn,
    ...recordData
  } = data

  // The four warranty columns move together. A save that names any of them
  // restates the whole warranty, with the row filling in what was left
  // out, so they can never be left contradicting each other; and the
  // expiry follows the service date even when only the date was changed.
  const warrantyTouched =
    data.warrantyStatus !== undefined ||
    data.warrantyMonths !== undefined ||
    data.warrantyMileage !== undefined ||
    data.warrantyNotes !== undefined
  const warranty = warrantyTouched
    ? normalizeWarranty({
        warrantyStatus: data.warrantyStatus ?? existing.warrantyStatus,
        warrantyMonths: data.warrantyMonths ?? existing.warrantyMonths,
        warrantyMileage: data.warrantyMileage ?? existing.warrantyMileage,
        warrantyNotes: data.warrantyNotes ?? existing.warrantyNotes,
      })
    : null
  const movedServiceDate =
    data.serviceDate !== undefined ? toSafeWorkshopDate(data.serviceDate, timeZone) : undefined
  const warrantyExpiresAt =
    warranty || movedServiceDate
      ? warrantyExpiryFor(
          warranty ?? normalizeWarranty(existing),
          movedServiceDate ?? existing.serviceDate,
          timeZone
        )
      : undefined

  // A job totalled with tax components keeps its split in step with the
  // lines the client sent: the amounts are recomputed here from the
  // components on the row, because the editor only knows the combined
  // rate and must not leave the printed GST and QST lines stale.
  //
  // The same goes for a job with a line left out of the tax: what the
  // tax is charged on comes from the lines as they are about to be
  // stored, so it is worked out here and never taken from the caller.
  // Lines the caller did not send are the ones already on the job.
  const linesSent = partItems !== undefined || laborItems !== undefined
  const taxApplies = linesSent ? await loadTaxApplies(organizationId) : null
  const taxedParts =
    partItems !== undefined && taxApplies ? withTaxableParts(partItems, taxApplies) : undefined
  const taxedLabor =
    laborItems !== undefined && taxApplies ? withTaxableLabor(laborItems, taxApplies) : undefined
  const moneyTouched =
    linesSent ||
    recordData.subtotal !== undefined ||
    recordData.discountAmount !== undefined ||
    recordData.taxRate !== undefined
  // A save that is re-totalled from what is stored works its money out once
  // everything is written, below; this reckons from the caller's subtotal.
  const savedTax =
    moneyTouched && !options.retotal
      ? savedDocumentTax({
          subtotal: recordData.subtotal ?? existing.subtotal,
          discountAmount: recordData.discountAmount ?? existing.discountAmount,
          // A job with components keeps the rate they add up to.
          taxRate: parseTaxComponentDefinitions(existing.taxComponents)
            ? existing.taxRate
            : (recordData.taxRate ?? existing.taxRate),
          taxInclusive: recordData.taxInclusive ?? existing.taxInclusive,
          taxComponents: existing.taxComponents,
          parts:
            taxedParts ??
            (await db.servicePart.findMany({
              where: { serviceRecordId: id },
              select: { total: true, taxable: true },
            })),
          labor:
            taxedLabor ??
            (await db.serviceLabor.findMany({
              where: { serviceRecordId: id },
              select: { total: true, taxable: true, pricingType: true },
            })),
        })
      : null
  // The split is restated only by a save that restates the subtotal, as
  // before; a job with untaxed lines is restated by any save that touches
  // its money, since any of them moves what the tax is charged on.
  const restated =
    savedTax?.totals && (recordData.subtotal !== undefined || savedTax.taxableSubtotal !== null)
      ? savedTax.totals
      : null
  if (restated) {
    if (restated.taxComponents) recordData.taxRate = existing.taxRate
    recordData.taxAmount = restated.taxAmount
    recordData.totalAmount = restated.totalAmount
  }
  // A job with components keeps the rate they add up to, here too.
  if (options.retotal && parseTaxComponentDefinitions(existing.taxComponents)) {
    delete recordData.taxRate
  }

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
    // What the job read before this save, under its row lock, so two
    // saves of the job at once take turns on the vehicle's reading too.
    const before = await lockJobReading(tx, { organizationId, jobId: id })
    const updated = await tx.serviceRecord.update({
      where: { id },
      data: {
        ...recordData,
        // The form carries the stage, not the workshop's own status, which
        // is chosen and saved on its own. So a save that moves the stage
        // drops a status that belonged to the old one, and a save that
        // leaves the stage alone leaves the status alone.
        ...(recordData.status !== undefined && recordData.status !== existing.status
          ? { customStatusId: null, customStatusSince: null }
          : {}),
        taxComponents: restated?.taxComponents,
        ...(savedTax ? { taxableSubtotal: savedTax.taxableSubtotal } : {}),
        // Attaching a vehicle to a counter sale: the direct customer link is
        // cleared so the invoice follows the vehicle's customer again.
        customerId:
          recordData.vehicleId && recordData.vehicleId !== existing.vehicleId && existing.customerId
            ? null
            : undefined,
        description:
          recordData.description !== undefined ? recordData.description || null : undefined,
        techName: recordData.techName !== undefined ? recordData.techName || null : undefined,
        diagnosticNotes:
          recordData.diagnosticNotes !== undefined ? recordData.diagnosticNotes || null : undefined,
        invoiceNotes:
          recordData.invoiceNotes !== undefined ? recordData.invoiceNotes || null : undefined,
        invoiceNumber:
          recordData.invoiceNumber !== undefined ? recordData.invoiceNumber || null : undefined,
        mileage: recordData.mileage !== undefined ? (recordData.mileage ?? null) : undefined,
        serviceDate: toSafeWorkshopDate(data.serviceDate, timeZone),
        // An emptied date clears it; the invoice then falls back to the
        // scheduled start or the service date, as it did before one was set.
        invoiceDate:
          data.invoiceDate !== undefined
            ? (toSafeWorkshopDate(data.invoiceDate, timeZone) ?? null)
            : undefined,
        invoiceDueDate:
          data.invoiceDueDate !== undefined
            ? (toSafeWorkshopDate(data.invoiceDueDate, timeZone) ?? null)
            : undefined,
        ...(warranty ?? {}),
        warrantyExpiresAt,
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
      if (taxedParts && taxedParts.length > 0) {
        await tx.servicePart.createMany({
          data: taxedParts.map((p) => ({
            partNumber: p.partNumber,
            name: p.name,
            quantity: p.quantity,
            unit: p.unit ?? null,
            category: p.category ?? null,
            unitPrice: p.unitPrice,
            total: p.total,
            unitCost: p.unitCost ?? 0,
            markupPercent: p.markupPercent ?? 0,
            inventoryPartId: p.inventoryPartId || null,
            taxable: p.taxable,
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

    /**
     * Reconcile concerns by id, rather than replacing them like the rows
     * above.
     *
     * Parts and labour can be deleted and rewritten on every save because
     * nothing points at them. Findings point at concerns, and the relation
     * is SetNull, so deleting the whole list on an autosave would silently
     * cut every diagnosis loose from the question it answered. The rows
     * that survive an edit have to keep their ids.
     */
    if (concerns !== undefined) {
      const existingConcerns = await tx.serviceConcern.findMany({
        where: { serviceRecordId: id },
        select: { id: true, confirmedAt: true, confirmedById: true },
      })
      const existingById = new Map(existingConcerns.map((concern) => [concern.id, concern]))
      const now = new Date()
      const keptIds = new Set(
        concerns.map((concern) => concern.id).filter((cid): cid is string => Boolean(cid))
      )

      const removedIds = existingConcerns
        .map((concern) => concern.id)
        .filter((cid) => !keptIds.has(cid))
      if (removedIds.length > 0) {
        await tx.serviceConcern.deleteMany({ where: { id: { in: removedIds } } })
      }

      for (const [index, concern] of concerns.entries()) {
        const sortOrder = concern.sortOrder ?? index
        // An id the client sent that is not on this job is not ours to
        // trust: fall through to a create rather than updating by id.
        if (concern.id && keptIds.has(concern.id)) {
          const { count } = await tx.serviceConcern.updateMany({
            where: { id: concern.id, serviceRecordId: id },
            data: {
              description: concern.description,
              sortOrder,
              ...concernStoryData(concern, existingById.get(concern.id) ?? null, userId, now),
            },
          })
          if (count > 0) continue
        }
        await tx.serviceConcern.create({
          data: {
            description: concern.description,
            sortOrder,
            serviceRecordId: id,
            ...concernStoryData(concern, null, userId, now),
          },
        })
      }
    }

    // Replace labor if provided
    if (laborItems !== undefined) {
      await tx.serviceLabor.deleteMany({ where: { serviceRecordId: id } })
      if (taxedLabor && taxedLabor.length > 0) {
        await tx.serviceLabor.createMany({
          data: taxedLabor.map((l) => ({
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

    // The job's reading may become the vehicle's, or correct it: the rule
    // is in vehicleReading.ts. A job that moved to another vehicle in this
    // save speaks for that vehicle, with whatever reading it now carries;
    // the vehicle it left keeps its reading, which is no longer the job's.
    const vehicleBefore = before ? before.vehicleId : existing.vehicleId
    const sameVehicle = updated.vehicleId === vehicleBefore
    if (!sameVehicle && vehicleBefore) {
      await forgetJobReading(tx, { organizationId, jobId: id })
      // Its meter readings stay in the old vehicle's history, no longer the job's.
      await unlinkJobMeterReadingsFromOtherVehicles(tx, {
        organizationId,
        jobId: id,
        vehicleId: updated.vehicleId,
      })
      // And it no longer works on the old vehicle's equipment.
      await tx.serviceRecordEquipment.deleteMany({
        where: {
          organizationId,
          serviceRecordId: id,
          ...(updated.vehicleId ? { item: { vehicleId: { not: updated.vehicleId } } } : {}),
        },
      })
    }
    if (updated.vehicleId && (recordData.mileage !== undefined || !sameVehicle)) {
      await applyJobReading(tx, {
        organizationId,
        vehicleId: updated.vehicleId,
        jobId: id,
        jobDate: jobReadingDate(updated),
        reading: updated.mileage,
        previousReading: sameVehicle ? (before ? before.mileage : existing.mileage) : undefined,
      })
    }

    // The money of a save that sent none: worked out from the lines, the
    // discount and the tax as they are stored now, whoever wrote each of
    // them. Only when this save moved something the money is made of.
    if (
      options.retotal &&
      (linesSent ||
        data.discountType !== undefined ||
        data.discountValue !== undefined ||
        data.taxRate !== undefined)
    ) {
      await retotalServiceRecord(id, tx)
      const totals = await tx.serviceRecord.findUniqueOrThrow({
        where: { id },
        select: { totalAmount: true },
      })
      return tx.serviceRecord.update({ where: { id }, data: { cost: totals.totalAmount } })
    }

    return updated
  })

  // Files of removed attachments, let go after the transaction committed.
  await releaseFiles(removedFileUrls, {
    organizationId,
    reason: 'work order attachments replaced',
  })

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
}
