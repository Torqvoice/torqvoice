'use server'

import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { createQuoteRecord } from '@/features/quotes/Lib/createQuoteRecord'
import { createQuoteSchema } from '@/features/quotes/Schema/quoteSchema'
import { getTranslations } from 'next-intl/server'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { OPEN_SERVICE_STATUSES } from '@/lib/service-record'
import { defectLineText, defectsWorstFirst } from '../Lib/conversion'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import {
  createInspectionSchema,
  updateInspectionDetailsSchema,
  updateInspectionItemSchema,
} from '../Schema/inspectionSchema'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { notificationBus } from '@/lib/notification-bus'
import { findCompletionBlockers, summariseBlockers } from '../Lib/completion'
import { clearedToNull } from '@/lib/clearable'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import { releaseFiles } from '@/lib/files/manager'
import { inspectionFileUrls } from '@/lib/files/collect'

export async function getInspectionsPaginated(params: {
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

      if (params.status && params.status !== 'all') {
        where.status = params.status
      }

      if (params.search) {
        where.OR = [
          { vehicle: { make: { contains: params.search, mode: 'insensitive' } } },
          { vehicle: { model: { contains: params.search, mode: 'insensitive' } } },
          { vehicle: { licensePlate: { contains: params.search, mode: 'insensitive' } } },
          { template: { name: { contains: params.search, mode: 'insensitive' } } },
        ]
      }

      const [records, total, statusCounts] = await Promise.all([
        db.inspection.findMany({
          where,
          include: {
            vehicle: {
              select: { id: true, make: true, model: true, year: true, licensePlate: true },
            },
            template: { select: { id: true, name: true, severityScale: true } },
            items: { select: { id: true, condition: true } },
          },
          orderBy: (() => {
            const dir = params.sortOrder || 'desc'
            switch (params.sortBy) {
              // Column shows "year make model"; sort make, model, year so
              // identical models group together
              case 'vehicle':
                return [
                  { vehicle: { make: dir } },
                  { vehicle: { model: dir } },
                  { vehicle: { year: dir } },
                ]
              case 'template':
                return { template: { name: dir } }
              case 'status':
                return { status: dir }
              case 'createdAt':
                return { createdAt: dir }
              default:
                return { createdAt: 'desc' as const }
            }
          })(),
          skip,
          take: pageSize,
        }),
        db.inspection.count({ where }),
        db.inspection.groupBy({
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
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function getInspection(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
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
                select: { id: true, name: true, email: true, phone: true, telegramChatId: true },
              },
            },
          },
          template: {
            select: { id: true, name: true, severityScale: true, country: true, standard: true },
          },
          technician: { select: { id: true, name: true } },
          items: { orderBy: { sortOrder: 'asc' } },
          attachments: { orderBy: { createdAt: 'asc' } },
          quotes: {
            select: {
              id: true,
              quoteNumber: true,
              status: true,
              createdAt: true,
              user: { select: { name: true } },
            },
          },
          serviceRecords: {
            select: { id: true, title: true, status: true, invoiceNumber: true, createdAt: true },
            orderBy: { createdAt: 'desc' as const },
          },
          quoteRequests: {
            where: { status: 'pending' },
            select: { id: true, message: true, selectedItemIds: true, createdAt: true },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
          },
        },
      })
      // Missing or foreign-org inspection yields null rather than an error: the
      // page renders its not-found state, and this also runs during the
      // post-delete re-render of the inspection route.
      return inspection
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function getVehicleInspections(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspections = await db.inspection.findMany({
        where: { vehicleId, organizationId },
        include: {
          template: { select: { id: true, name: true } },
          items: { select: { id: true, condition: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return inspections
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function createInspection(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const data = createInspectionSchema.parse(input)

      // Verify vehicle belongs to org
      const vehicle = await db.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId },
      })
      if (!vehicle) throw new Error('Vehicle not found')

      // Verify template belongs to org
      const template = await db.inspectionTemplate.findFirst({
        where: { id: data.templateId, organizationId },
        include: {
          sections: {
            include: { items: { orderBy: { sortOrder: 'asc' } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })
      if (!template) throw new Error('Template not found')

      // Started from a booked job: the job has to be this car's, and not
      // already the work of another inspection.
      if (data.serviceRecordId) {
        const job = await db.serviceRecord.findFirst({
          where: { id: data.serviceRecordId, organizationId, vehicleId: data.vehicleId },
          select: { id: true, inspectionId: true },
        })
        if (!job) throw new Error('Work order not found')
        if (job.inspectionId) throw new Error('That work order already has an inspection')
      }

      // Look up technician linked to current user
      const technician = await db.technician.findFirst({
        where: { userId, organizationId, isActive: true },
        select: { id: true },
      })

      const inspection = await db.$transaction(async (tx) => {
        const created = await tx.inspection.create({
          data: {
            vehicleId: data.vehicleId,
            templateId: data.templateId,
            mileage: data.mileage,
            technicianId: technician?.id ?? null,
            // Snapshotted so editing the template later cannot relabel a
            // certificate that has already been issued from this inspection.
            severityScale: template.severityScale,
            country: template.country,
            organizationId,
          },
        })

        // Copy template items into inspection items with globally unique sortOrder
        // so sections always appear in a stable order when sorted by sortOrder.
        // The whole check definition is copied, not just the name, so editing or
        // deleting the template later cannot change what an issued inspection says.
        const items = template.sections.flatMap((section, sIdx) =>
          section.items.map((item) => ({
            name: item.name,
            section: section.name,
            sectionCode: section.code,
            description: item.description,
            code: item.code,
            sortOrder: sIdx * 1000 + item.sortOrder,
            inputType: item.inputType,
            unit: item.unit,
            minValue: item.minValue,
            maxValue: item.maxValue,
            choices: item.choices,
            required: item.required,
            photoRequired: item.photoRequired,
            allowNotApplicable: item.allowNotApplicable,
            defaultSeverity: item.defaultSeverity,
            defectSuggestions: item.defectSuggestions,
            inspectionId: created.id,
          }))
        )

        if (items.length > 0) {
          await tx.inspectionItem.createMany({ data: items })
        }

        if (data.serviceRecordId) {
          await tx.serviceRecord.update({
            where: { id: data.serviceRecordId },
            data: { inspectionId: created.id },
          })
        }

        return created
      })

      revalidatePath('/inspections')
      revalidatePath(`/vehicles/${data.vehicleId}`)
      if (data.serviceRecordId) {
        revalidatePath(`/vehicles/${data.vehicleId}/service/${data.serviceRecordId}`)
      }
      return { ...inspection, vehicleId: data.vehicleId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspection.create',
        entity: 'Inspection',
        entityId: result.id,
        details: { key: 'inspection_create', params: { id: result.id } },
        metadata: { inspectionId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

export async function updateInspectionItem(itemId: string, input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateInspectionItemSchema.parse(input)

      const item = await db.inspectionItem.findFirst({
        where: { id: itemId, inspection: { organizationId } },
      })
      if (!item) throw new Error('Inspection item not found')

      const updated = await db.inspectionItem.update({
        where: { id: itemId },
        data: {
          condition: data.condition,
          notes: clearedToNull(data.notes),
          imageUrls: data.imageUrls,
          measuredValue: data.measuredValue,
          textValue: clearedToNull(data.textValue),
        },
      })

      // A photo taken off the item is not deleted here. The page sends its
      // whole list with every save, and a list from a stale screen (another
      // device, or a save racing an upload) would otherwise cost a file that
      // is still wanted. One that is really unused is picked up by the file
      // sweep a week later, into the trash (lib/files/manager.ts).

      return updated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

/**
 * Saves the certificate fields required by Directive 2014/45/EU Annex IV that
 * are not derivable from the checks themselves.
 */
export async function updateInspectionDetails(id: string, input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = updateInspectionDetailsSchema.parse(input)

      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!inspection) throw new Error('Inspection not found')

      // The inspector is chosen from the roster, so the name on the certificate
      // is snapshotted from the technician record rather than trusted from the
      // client — Annex IV(i) has to name someone who actually works here.
      let inspectorName: string | null | undefined
      if (data.technicianId !== undefined) {
        if (data.technicianId === null) {
          inspectorName = null
        } else {
          const technician = await db.technician.findFirst({
            where: { id: data.technicianId, organizationId },
            select: { name: true },
          })
          if (!technician) throw new Error('Technician not found')
          inspectorName = technician.name
        }
      }

      const updated = await db.inspection.update({
        where: { id },
        data: {
          mileage: data.mileage,
          vehicleCategory: data.vehicleCategory,
          certificateNumber: data.certificateNumber,
          technicianId: data.technicianId,
          inspectorName,
          testLocation: data.testLocation,
          nextTestDue: data.nextTestDue,
          notes: data.notes,
        },
      })

      revalidatePath(`/inspections/${id}`)
      return updated
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

export async function completeInspection(id: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
          technician: { select: { name: true } },
          items: {
            select: {
              id: true,
              name: true,
              code: true,
              condition: true,
              required: true,
              photoRequired: true,
              imageUrls: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      })
      if (!inspection) throw new Error('Inspection not found')

      // Enforced here, not only in the form: a template marking a check
      // mandatory, or requiring a photo of a defect, is a promise the report
      // makes to whoever reads it. A client-side warning alone would let a
      // report be issued that quietly breaks it.
      const blockers = findCompletionBlockers(
        inspection.items.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          condition: item.condition,
          required: item.required,
          photoRequired: item.photoRequired,
          photoCount: item.imageUrls.length,
        }))
      )
      if (blockers.length > 0) {
        throw new Error(summariseBlockers(blockers))
      }

      // Annex IV(i) wants the tester named on the certificate. Snapshot it now so
      // the record stays accurate if the technician later leaves or is renamed.
      let inspectorName = inspection.inspectorName ?? inspection.technician?.name ?? null
      if (!inspectorName) {
        const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
        inspectorName = user?.name ?? null
      }

      await db.inspection.updateMany({
        where: { id, organizationId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          ...(inspection.inspectorName ? {} : { inspectorName }),
        },
      })

      notificationBus.emit('workboard', {
        type: 'job_status_changed',
        organizationId,
        inspectionId: id,
        status: 'completed',
      })

      revalidatePath('/inspections')
      revalidatePath(`/inspections/${id}`)
      revalidatePath(`/vehicles/${inspection.vehicleId}`)
      return { success: true, inspectionId: id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspection.complete',
        entity: 'Inspection',
        entityId: result.inspectionId,
        details: { key: 'inspection_complete', params: { id: result.inspectionId } },
        metadata: { inspectionId: result.inspectionId },
      }),
    }
  )
}

/**
 * Puts a completed inspection back into progress so its checks can be edited.
 *
 * The certificate snapshot is left alone: the inspector, certificate number and
 * next-test date stay as recorded, since reopening is usually a correction
 * rather than a fresh test. `completedAt` is cleared, so the result reverts to
 * in-progress until it is completed again.
 */
export async function reopenInspection(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        select: { id: true, status: true, vehicleId: true },
      })
      if (!inspection) throw new Error('Inspection not found')
      if (inspection.status !== 'completed') {
        throw new Error('This inspection is already in progress')
      }

      await db.inspection.updateMany({
        where: { id, organizationId },
        data: { status: 'in_progress', completedAt: null },
      })

      notificationBus.emit('workboard', {
        type: 'job_status_changed',
        organizationId,
        inspectionId: id,
        status: 'in_progress',
      })

      revalidatePath('/inspections')
      revalidatePath(`/inspections/${id}`)
      revalidatePath(`/vehicles/${inspection.vehicleId}`)
      return { success: true, inspectionId: id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspection.reopen',
        entity: 'Inspection',
        entityId: result.inspectionId,
        details: { key: 'inspection_reopen', params: { id: result.inspectionId } },
        metadata: { inspectionId: result.inspectionId },
      }),
    }
  )
}

export async function deleteInspection(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
      })
      if (!inspection) throw new Error('Inspection not found')

      // Its items cascade with it, and their photos are let go afterwards.
      const files = await inspectionFileUrls(organizationId, [id])
      await db.inspection.deleteMany({ where: { id, organizationId } })
      await releaseFiles(files, { organizationId, reason: 'inspection deleted' })
      revalidatePath('/inspections')
      revalidatePath(`/vehicles/${inspection.vehicleId}`)
      return { inspectionId: id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS },
      ],
      audit: ({ result }) => ({
        action: 'inspection.delete',
        entity: 'Inspection',
        entityId: result.inspectionId,
        details: { key: 'inspection_delete', params: { id: result.inspectionId } },
        metadata: { inspectionId: result.inspectionId },
      }),
    }
  )
}

/**
 * The defect notes this organization has written most often against each check
 * on a given inspection, so a shop's own phrasing is offered back to it.
 *
 * Deliberately one grouped query for the whole page rather than one per check:
 * an Annex I checklist runs to ninety-odd items, and a per-item lookup would
 * mean ninety round-trips to render a form.
 */
export async function getCommonDefectNotes(inspectionId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const items = await db.inspectionItem.findMany({
        where: { inspectionId, inspection: { organizationId } },
        select: { name: true },
        distinct: ['name'],
      })
      if (items.length === 0) return {} as Record<string, { text: string; severity: string }[]>

      const names = items.map((i) => i.name)

      const grouped = await db.inspectionItem.groupBy({
        by: ['name', 'notes', 'condition'],
        where: {
          inspection: { organizationId },
          // Exclude this inspection so a note just typed does not immediately
          // reappear as a suggestion under the field it was typed into.
          inspectionId: { not: inspectionId },
          name: { in: names },
          condition: { in: ['attention', 'fail', 'dangerous'] },
          notes: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { name: 'desc' } },
        take: 400,
      })

      const byName: Record<string, { text: string; severity: string; count: number }[]> = {}
      for (const row of grouped) {
        const text = row.notes?.trim()
        if (!text || text.length > 200) continue
        const bucket = (byName[row.name] ??= [])
        // The same wording can have been graded differently on different
        // vehicles; keep the grade it carried most often.
        const existing = bucket.find((b) => b.text.toLowerCase() === text.toLowerCase())
        if (existing) {
          if (row._count._all > existing.count) {
            existing.severity = row.condition
            existing.count = row._count._all
          }
          continue
        }
        bucket.push({ text, severity: row.condition, count: row._count._all })
      }

      const result: Record<string, { text: string; severity: string }[]> = {}
      for (const [name, list] of Object.entries(byName)) {
        result[name] = list
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
          .map(({ text, severity }) => ({ text, severity }))
      }
      return result
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

/**
 * The workshop's active technicians, for choosing who carried out a test.
 *
 * Scoped to inspection rights rather than work-board rights: a tester who can
 * open an inspection has to be able to say who ran it, and this returns
 * nothing but a roster of names.
 */
export async function getInspectionTechnicians() {
  return withAuth(
    async ({ organizationId }) => {
      return db.technician.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, color: true },
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}

/**
 * Raises a work order straight from an inspection, skipping the quote.
 *
 * Plenty of customers just say "fix it". Forcing a quote in between means
 * building an estimate nobody asked for and waiting for an approval that has
 * already been given out loud. And a car that passed still has to be paid
 * for, so an inspection with no defects raises a job too.
 *
 * The job opens with a line for the inspection itself, which is what the
 * workshop charges for whatever it found. With `includeDefects` every check
 * that was not OK follows as a line of its own, carrying the check and the
 * technician's note, dangerous first, then major, then minor: the order the
 * work should be done in.
 */
export async function createWorkOrderFromInspection(
  id: string,
  options: { includeDefects?: boolean } = {}
) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
          vehicle: {
            select: { id: true, customer: { select: { taxExempt: true } } },
          },
          template: { select: { name: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
      })
      if (!inspection) throw new Error('Inspection not found')

      const defects = options.includeDefects === false ? [] : defectsWorstFirst(inspection.items)

      const [rate, timeZone, t] = await Promise.all([
        db.appSetting.findUnique({
          where: { organizationId_key: { organizationId, key: 'workshop.defaultLaborRate' } },
          select: { value: true },
        }),
        workshopTimeZone(organizationId),
        getTranslations('inspections.page'),
      ])
      const laborRate = Number(rate?.value) || 0

      // One transaction for the number, the link and the lines. The draft
      // used to be committed first, so a failure after it left a numbered,
      // titled job on the board that pointed at nothing.
      const record = await db.$transaction(async (tx) => {
        // Numbered, titled, taxed and scheduled as any other new job is.
        const draft = await createDraftRecord(
          { organizationId, userId },
          {
            vehicleId: inspection.vehicle.id,
            customerId: null,
            customerExempt: inspection.vehicle.customer?.taxExempt ?? false,
            title: null,
            technicianId: inspection.technicianId ?? undefined,
            tx,
          }
        )
        await tx.serviceRecord.update({
          where: { id: draft.id },
          data: {
            description: t('raisedFromInspection', {
              date: zonedDayKey(inspection.createdAt, timeZone),
            }),
            type: defects.length > 0 ? 'repair' : 'inspection',
            inspectionId: inspection.id,
            mileage: inspection.mileage,
          },
        })
        // Hours start at zero: the workshop prices the job as it works.
        await tx.serviceLabor.createMany({
          data: [inspection.template.name, ...defects.map(defectLineText)].map((description) => ({
            description,
            hours: 0,
            rate: laborRate,
            total: 0,
            serviceRecordId: draft.id,
          })),
        })
        await retotalServiceRecord(draft.id, tx)
        return draft
      })

      revalidatePath('/work-orders')
      revalidatePath('/work-board')
      revalidatePath(`/inspections/${id}`)
      revalidatePath(`/vehicles/${inspection.vehicle.id}`)
      return { id: record.id, vehicleId: inspection.vehicle.id, defectCount: defects.length }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.create',
        entity: 'ServiceRecord',
        entityId: result.id,
        details: { key: 'service_createFromInspection', params: { ref: result.id } },
        metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

/**
 * Raises a quote from an inspection: a line for the inspection itself, then
 * every check that was not OK, worst first, each carrying the technician's
 * note. Built here from what the database holds rather than from what the
 * page was showing, so a note typed after the page loaded is on the quote.
 */
export async function createQuoteFromInspection(id: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
          vehicle: {
            select: { id: true, make: true, model: true, year: true, customerId: true },
          },
          template: { select: { name: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
      })
      if (!inspection) throw new Error('Inspection not found')

      const t = await getTranslations('inspections.page')
      const vehicle = inspection.vehicle
      const quote = await createQuoteRecord(
        { organizationId, userId },
        createQuoteSchema.parse({
          title: t('quoteTitle', {
            vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          }),
          vehicleId: vehicle.id,
          customerId: vehicle.customerId ?? undefined,
          inspectionId: inspection.id,
          status: 'draft',
          laborItems: [
            inspection.template.name,
            ...defectsWorstFirst(inspection.items).map(defectLineText),
          ].map((description) => ({ description, hours: 0, rate: 0, total: 0 })),
        })
      )

      revalidatePath('/quotes')
      revalidatePath(`/inspections/${id}`)
      return { id: quote.id, quoteNumber: quote.quoteNumber }
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

/**
 * The jobs an inspection could be linked to instead of raising a new one: this
 * car's open jobs that are not already the work of another inspection. The
 * desk books "inspection" as a job a week ahead, and on the day the
 * technician's checklist should land on that booking, not beside it.
 */
export async function getLinkableWorkOrders(inspectionId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id: inspectionId, organizationId },
        select: { vehicleId: true },
      })
      if (!inspection) throw new Error('Inspection not found')

      return db.serviceRecord.findMany({
        where: {
          organizationId,
          vehicleId: inspection.vehicleId,
          inspectionId: null,
          status: { in: [...OPEN_SERVICE_STATUSES] },
        },
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          type: true,
          status: true,
          startDateTime: true,
          createdAt: true,
        },
        orderBy: [{ startDateTime: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

/**
 * Puts the inspection on a job that already exists. The job gets a line for
 * the inspection unless it already carries one, and with `includeDefects`
 * every check that was not OK follows, as when a job is raised fresh.
 */
export async function linkWorkOrderToInspection(
  id: string,
  serviceRecordId: string,
  options: { includeDefects?: boolean } = {}
) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
          template: { select: { name: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
      })
      if (!inspection) throw new Error('Inspection not found')

      const job = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId, vehicleId: inspection.vehicleId },
        select: {
          id: true,
          vehicleId: true,
          invoiceNumber: true,
          inspectionId: true,
          laborItems: { select: { description: true } },
        },
      })
      if (!job) throw new Error('Work order not found')
      if (job.inspectionId && job.inspectionId !== inspection.id) {
        throw new Error('That work order already has an inspection')
      }

      const defects = options.includeDefects === false ? [] : defectsWorstFirst(inspection.items)
      const hasInspectionLine = job.laborItems.some(
        (line) => line.description.trim() === inspection.template.name.trim()
      )
      const rate = await db.appSetting.findUnique({
        where: { organizationId_key: { organizationId, key: 'workshop.defaultLaborRate' } },
        select: { value: true },
      })
      const laborRate = Number(rate?.value) || 0

      await db.$transaction(async (tx) => {
        await tx.serviceRecord.update({
          where: { id: job.id },
          data: { inspectionId: inspection.id, mileage: inspection.mileage ?? undefined },
        })
        const lines = [
          ...(hasInspectionLine ? [] : [inspection.template.name]),
          ...defects.map(defectLineText),
        ]
        if (lines.length > 0) {
          await tx.serviceLabor.createMany({
            data: lines.map((description) => ({
              description,
              hours: 0,
              rate: laborRate,
              total: 0,
              serviceRecordId: job.id,
            })),
          })
          await retotalServiceRecord(job.id, tx)
        }
      })

      revalidatePath('/work-orders')
      revalidatePath(`/inspections/${id}`)
      revalidatePath(`/vehicles/${inspection.vehicleId}/service/${job.id}`)
      return {
        id: job.id,
        vehicleId: inspection.vehicleId,
        invoiceNumber: job.invoiceNumber,
        defectCount: defects.length,
      }
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
        metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId, linkedInspection: id },
      }),
    }
  )
}
