'use server'

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
import { isDefect } from '../Lib/conditions'
import { findCompletionBlockers, summariseBlockers } from '../Lib/completion'

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
              customer: { select: { id: true, name: true, email: true, phone: true } },
            },
          },
          template: {
            select: { id: true, name: true, severityScale: true, country: true, standard: true },
          },
          technician: { select: { id: true, name: true } },
          items: { orderBy: { sortOrder: 'asc' } },
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
            defaultSeverity: item.defaultSeverity,
            defectSuggestions: item.defectSuggestions,
            inspectionId: created.id,
          }))
        )

        if (items.length > 0) {
          await tx.inspectionItem.createMany({ data: items })
        }

        return created
      })

      revalidatePath('/inspections')
      revalidatePath(`/vehicles/${data.vehicleId}`)
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
          notes: data.notes,
          imageUrls: data.imageUrls,
          measuredValue: data.measuredValue,
          textValue: data.textValue,
        },
      })

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

      await db.inspection.deleteMany({ where: { id, organizationId } })
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
 * already been given out loud, so the defects become labour lines on a pending
 * job directly. Each line carries the check that found it and the note the
 * technician wrote, which is what the person doing the repair needs to read.
 *
 * Dangerous defects lead, then major, then minor — the order the work should
 * be done in.
 */
export async function createWorkOrderFromInspection(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id, organizationId },
        include: {
          vehicle: { select: { id: true, make: true, model: true, year: true } },
          items: { orderBy: { sortOrder: 'asc' } },
          technician: { select: { id: true, name: true } },
        },
      })
      if (!inspection) throw new Error('Inspection not found')

      const severityOrder: Record<string, number> = { dangerous: 0, fail: 1, attention: 2 }
      const defects = inspection.items
        .filter((item) => isDefect(item.condition))
        .sort(
          (a, b) =>
            (severityOrder[a.condition] ?? 9) - (severityOrder[b.condition] ?? 9) ||
            a.sortOrder - b.sortOrder
        )
      if (defects.length === 0) {
        throw new Error('This inspection has no defects to work on')
      }

      const [settings, org] = await Promise.all([
        db.appSetting.findMany({
          where: {
            organizationId,
            key: {
              in: [
                'workshop.invoicePrefix',
                'workshop.defaultLaborRate',
                'workshop.defaultTaxRate',
                'workshop.taxEnabled',
                'workshop.taxInclusive',
              ],
            },
          },
        }),
        db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      ])
      const settingsMap: Record<string, string> = {}
      for (const s of settings) settingsMap[s.key] = s.value

      const rawPrefix = settingsMap['workshop.invoicePrefix'] ?? '{year}-'
      const now = new Date()
      const prefix = rawPrefix
        .replace('{year}', now.getFullYear().toString())
        .replace('{month}', String(now.getMonth() + 1).padStart(2, '0'))

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

      const taxEnabled = settingsMap['workshop.taxEnabled'] !== 'false'
      const laborRate = Number(settingsMap['workshop.defaultLaborRate']) || 0
      const vehicleName = `${inspection.vehicle.year} ${inspection.vehicle.make} ${inspection.vehicle.model}`

      const record = await db.$transaction(async (tx) => {
        const created = await tx.serviceRecord.create({
          data: {
            organizationId,
            title: `${vehicleName} — inspection repairs`,
            description: `Raised from the inspection carried out on ${inspection.createdAt.toISOString().slice(0, 10)}.`,
            type: 'repair',
            status: 'pending',
            vehicleId: inspection.vehicle.id,
            inspectionId: inspection.id,
            technicianId: inspection.technicianId,
            techName: inspection.technician?.name,
            shopName: org?.name || undefined,
            invoiceNumber: `${prefix}${nextNum}`,
            mileage: inspection.mileage,
            // Hours and totals stay at zero: the point is to get the job on the
            // board immediately, and the workshop prices it as it works.
            taxRate: taxEnabled ? Number(settingsMap['workshop.defaultTaxRate']) || 0 : 0,
            taxInclusive: settingsMap['workshop.taxInclusive'] === 'true',
            serviceDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            startDateTime: now,
          },
        })

        await tx.serviceLabor.createMany({
          data: defects.map((item) => ({
            description: [item.code ? `${item.code} ${item.name}` : item.name, item.notes]
              .filter(Boolean)
              .join(' — '),
            hours: 0,
            rate: laborRate,
            total: 0,
            serviceRecordId: created.id,
          })),
        })

        return created
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
