'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { calculateTotals } from '@/lib/tax'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { matchStock, parseTireSize, formatTireSize } from '../Lib/tireMatching'
import { TREATMENT_TYPES, billableTreatments, parseTreatmentPrices } from '../Lib/treatments'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { isTireHotelEnabled, requireTireHotel } from '../Lib/tireHotelSettings'

const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL }]
const QUOTE = [
  { action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL },
  { action: PermissionAction.CREATE, subject: PermissionSubject.QUOTES },
]
const JOB = [
  { action: PermissionAction.READ, subject: PermissionSubject.TIRE_HOTEL },
  { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
]

const fromSetSchema = z.object({
  tireSetId: z.string().min(1),
  /// The operator ticks the lines they want. Everything billable is ticked
  /// when the dialog opens, but a swap where the customer supplies the tires,
  /// or where the wash is a goodwill, should not force a line onto the job.
  includeTires: z.boolean().default(true),
  includeTreatments: z.array(z.enum(TREATMENT_TYPES)).optional(),
  /// Stocked part to quote, chosen by the operator from the matches. Omitted
  /// when nothing matched, which leaves a blank priced line to fill in.
  inventoryPartId: z.string().min(1).optional().nullable(),
  /// Unit price the operator settled on, since tire prices move weekly and
  /// the stocked figure is a starting point.
  unitPrice: z.coerce.number().min(0).max(1_000_000).optional(),
})

async function loadSet(organizationId: string, tireSetId: string) {
  const set = await db.tireSet.findFirst({
    where: { id: tireSetId, organizationId },
    select: {
      id: true,
      reference: true,
      season: true,
      size: true,
      quantity: true,
      withRims: true,
      hasTpms: true,
      brand: true,
      customerId: true,
      vehicleId: true,
      location: { select: { code: true, warehouse: { select: { name: true } } } },
      customer: { select: { id: true, taxExempt: true } },
      treatments: { select: { type: true, status: true } },
    },
  })
  if (!set) throw new Error('Tire set not found')
  return set
}

/**
 * Prep lines for a job, priced from settings.
 *
 * The work was agreed when the set was checked in, so it should reach the
 * bill without anyone retyping it. Only treatments the shop has put a price
 * against produce a line, which keeps washing off the invoice at shops that
 * fold it into the storage fee.
 */
/**
 * Treatment names in the reader's language.
 *
 * Loaded here rather than passed in from the browser: this text ends up on an
 * invoice, and invoice wording should not be whatever a client happened to
 * send.
 */
async function treatmentNames(): Promise<Record<string, string>> {
  const locale = (await cookies()).get('locale')?.value || 'en'
  try {
    const messages = (await import(`../../../../messages/${locale}/tireHotel.json`)).default
    return messages?.treatments?.types ?? {}
  } catch {
    const messages = (await import('../../../../messages/en/tireHotel.json')).default
    return messages?.treatments?.types ?? {}
  }
}

async function billablePrep(
  organizationId: string,
  treatments: { type: string; status: string }[]
) {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: { organizationId, key: SETTING_KEYS.TIRE_HOTEL_TREATMENT_PRICES },
    },
    select: { value: true },
  })
  return billableTreatments(treatments, parseTreatmentPrices(setting?.value))
}

async function treatmentLines(
  organizationId: string,
  treatments: { type: string; status: string }[],
  only?: string[]
) {
  const names = await treatmentNames()
  const billable = await billablePrep(organizationId, treatments)
  const wanted = only ? new Set(only) : null

  return billable
    .filter((line) => !wanted || wanted.has(line.type))
    .map((line) => ({
      description: names[line.type] ?? line.type,
      // A flat service line, not hours: prep is priced per job, and an hourly
      // line would invite someone to multiply it by a duration nobody tracked.
      hours: 1,
      rate: line.price,
      total: line.price,
      pricingType: 'service' as const,
    }))
}

/** Human label for the tires, used as the quote line and the job title. */
function describeSet(set: {
  quantity: number
  season: string
  size: string | null
  brand: string | null
}): string {
  const parsed = parseTireSize(set.size)
  const size = parsed ? formatTireSize(parsed) : set.size
  return [`${set.quantity}x`, set.brand, size, `${set.season} tires`].filter(Boolean).join(' ')
}

/**
 * Stocked tires that fit the stored set, so the operator can quote from what
 * the shop actually has rather than retyping the size into a search.
 */
export async function getJobDraftForSet(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const set = await loadSet(organizationId, tireSetId)

      // Narrow on the rim diameter before matching properly, so a large
      // catalogue is not pulled into memory whole.
      const target = parseTireSize(set.size)
      const candidates = target
        ? await db.inventoryPart.findMany({
            where: {
              organizationId,
              isArchived: false,
              OR: [
                { name: { contains: String(target.rim) } },
                { partNumber: { contains: String(target.rim) } },
                { description: { contains: String(target.rim) } },
              ],
            },
            select: {
              id: true,
              name: true,
              partNumber: true,
              description: true,
              category: true,
              quantity: true,
              unitCost: true,
              sellPrice: true,
            },
            take: 500,
          })
        : []

      return {
        size: set.size,
        parsedSize: target ? formatTireSize(target) : null,
        quantity: set.quantity,
        description: describeSet(set),
        matches: matchStock(candidates, set.size, set.quantity),
        // What the prep would add, so the dialog can list it and let the
        // operator drop any of it before it lands on the job.
        prep: await billablePrep(organizationId, set.treatments),
      }
    },
    { requiredPermissions: READ }
  )
}

/**
 * Quote for a new set of tires, built from what is already known.
 *
 * The stored set carries the size, the count and the owner, so none of it has
 * to be typed again. Priced from stock when something matches, and left at
 * zero when nothing does, which is honest: an unpriced line is obvious, a
 * guessed one is not.
 */
export async function createQuoteFromTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = fromSetSchema.parse(input)
      const set = await loadSet(organizationId, data.tireSetId)

      const part = data.inventoryPartId
        ? await db.inventoryPart.findFirst({
            where: { id: data.inventoryPartId, organizationId, isArchived: false },
            select: { id: true, name: true, partNumber: true, unitCost: true, sellPrice: true },
          })
        : null

      const settings = await db.appSetting.findMany({
        where: {
          organizationId,
          key: {
            in: [
              'workshop.quotePrefix',
              'workshop.quoteValidDays',
              'workshop.defaultTaxRate',
              'workshop.taxEnabled',
              'workshop.taxInclusive',
            ],
          },
        },
      })
      const map = new Map(settings.map((s) => [s.key, s.value]))

      const taxEnabled = map.get('workshop.taxEnabled') !== 'false'
      const taxInclusive = map.get('workshop.taxInclusive') === 'true'
      const taxRate =
        taxEnabled && !set.customer?.taxExempt ? Number(map.get('workshop.defaultTaxRate')) || 0 : 0

      const prefix = resolveInvoicePrefix(map.get('workshop.quotePrefix') ?? 'QT-')
      const lastQuote = await db.quote.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { quoteNumber: true },
      })
      const lastNumber = Number(lastQuote?.quoteNumber?.match(/(\d+)$/)?.[1])
      const quoteNumber = `${prefix}${Number.isFinite(lastNumber) ? lastNumber + 1 : 1001}`

      const validDays = Number(map.get('workshop.quoteValidDays')) || 30
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + validDays)

      const unitPrice = data.unitPrice ?? part?.sellPrice ?? 0
      const lineTotal = data.includeTires ? Math.round(unitPrice * set.quantity * 100) / 100 : 0
      const labor = await treatmentLines(organizationId, set.treatments, data.includeTreatments)
      const laborTotal = labor.reduce((sum, line) => sum + line.total, 0)
      const subtotal = Math.round((lineTotal + laborTotal) * 100) / 100
      const { taxAmount, totalAmount } = calculateTotals({
        subtotal,
        discountAmount: 0,
        taxRate,
        taxInclusive,
      })

      const quote = await db.quote.create({
        data: {
          quoteNumber,
          title: describeSet(set),
          status: 'draft',
          validUntil,
          subtotal,
          taxRate,
          taxAmount,
          taxInclusive,
          totalAmount,
          customerId: set.customerId,
          vehicleId: set.vehicleId,
          tireSetId: set.id,
          organizationId,
          userId,
          ...(data.includeTires
            ? {
                partItems: {
                  create: [
                    {
                      name: part?.name ?? describeSet(set),
                      partNumber: part?.partNumber ?? null,
                      quantity: set.quantity,
                      unitCost: part?.unitCost ?? 0,
                      unitPrice,
                      total: lineTotal,
                      inventoryPartId: part?.id ?? null,
                    },
                  ],
                },
              }
            : {}),
          ...(labor.length > 0 ? { laborItems: { create: labor } } : {}),
        },
      })

      revalidatePath('/quotes')
      revalidatePath(`/tire-hotel/${set.id}`)
      return { id: quote.id, quoteNumber: quote.quoteNumber, tireSetId: set.id }
    },
    {
      requiredPermissions: QUOTE,
      audit: ({ result }) => ({
        action: 'tire_set.create_quote',
        entity: 'Quote',
        entityId: result.id,
        message: `Created quote ${result.quoteNumber} from a tire set`,
        metadata: { tireSetId: result.tireSetId },
      }),
    }
  )
}

/**
 * Straight to a job, skipping the quote.
 *
 * The common case in season: the customer has already said swap them, and a
 * quote would only be a step between them asking and the work happening. The
 * set is linked to the record so the technician who picks the job up can see
 * which tires it is and, above all, which shelf to fetch them from.
 */
export async function createWorkOrderFromTireSet(input: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = fromSetSchema.parse(input)
      const set = await loadSet(organizationId, data.tireSetId)

      if (!set.vehicleId) {
        throw new Error('Link a vehicle to this set before creating a work order')
      }

      const record = await createDraftRecord(
        { organizationId, userId },
        {
          vehicleId: set.vehicleId,
          customerId: null,
          customerExempt: set.customer?.taxExempt ?? false,
          title: describeSet(set),
        }
      )

      const labor = await treatmentLines(organizationId, set.treatments, data.includeTreatments)
      if (labor.length > 0) {
        await db.serviceLabor.createMany({
          data: labor.map((line) => ({ ...line, serviceRecordId: record.id })),
        })
        await retotalServiceRecord(record.id)
      }

      const shelf = set.location
        ? `${set.location.code} (${set.location.warehouse.name})`
        : 'not on a shelf'

      await db.serviceRecord.update({
        where: { id: record.id },
        data: {
          tireSetId: set.id,
          // Repeated in the notes as well as the relation: the printed job
          // sheet and the PDF do not render the relation, and the shelf is
          // the one fact the technician needs before touching anything.
          diagnosticNotes: [
            `Tire set ${set.reference ?? ''}`.trim(),
            `Shelf: ${shelf}`,
            set.withRims ? 'On rims' : 'Tires only',
            set.hasTpms ? 'Has TPMS sensors' : null,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      })

      revalidatePath(`/vehicles/${set.vehicleId}`)
      revalidatePath(`/tire-hotel/${set.id}`)
      return {
        id: record.id,
        invoiceNumber: record.invoiceNumber,
        vehicleId: set.vehicleId,
        tireSetId: set.id,
      }
    },
    {
      requiredPermissions: JOB,
      audit: ({ result }) => ({
        action: 'tire_set.create_work_order',
        entity: 'ServiceRecord',
        entityId: result.id,
        message: `Created work order ${result.invoiceNumber ?? result.id} from a tire set`,
        metadata: { tireSetId: result.tireSetId },
      }),
    }
  )
}

/**
 * Open jobs this set could be added to.
 *
 * Scoped to the set's own vehicle: a tire change belongs on the job for the
 * car the tires go on, and offering another vehicle's job would put the line
 * on a bill the wrong customer receives.
 */
export async function getOpenWorkOrdersForSet(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const set = await loadSet(organizationId, tireSetId)
      if (!set.vehicleId) return []

      return db.serviceRecord.findMany({
        where: {
          organizationId,
          vehicleId: set.vehicleId,
          status: { in: ['pending', 'in_progress'] },
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
          tireSetId: true,
        },
      })
    },
    { requiredPermissions: READ }
  )
}

/**
 * Puts the tires and their prep onto a job that already exists.
 *
 * The common case is a car already booked in for something else: the customer
 * mentions the swap while it is on the ramp, and raising a second job for it
 * would split one visit across two invoices.
 */
export async function addTireSetToWorkOrder(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const data = fromSetSchema.extend({ serviceRecordId: z.string().min(1) }).parse(input)
      const set = await loadSet(organizationId, data.tireSetId)

      const record = await db.serviceRecord.findFirst({
        where: { id: data.serviceRecordId, organizationId },
        select: { id: true, invoiceNumber: true, vehicleId: true, tireSetId: true },
      })
      if (!record) throw new Error('That job no longer exists')
      if (set.vehicleId && record.vehicleId && record.vehicleId !== set.vehicleId) {
        throw new Error('That job is for a different vehicle')
      }

      const part = data.inventoryPartId
        ? await db.inventoryPart.findFirst({
            where: { id: data.inventoryPartId, organizationId, isArchived: false },
            select: { id: true, name: true, partNumber: true, unitCost: true, sellPrice: true },
          })
        : null

      const unitPrice = data.unitPrice ?? part?.sellPrice ?? 0
      const labor = await treatmentLines(organizationId, set.treatments, data.includeTreatments)

      await db.$transaction(async (tx) => {
        if (data.includeTires) {
          await tx.servicePart.create({
            data: {
              serviceRecordId: record.id,
              name: part?.name ?? describeSet(set),
              partNumber: part?.partNumber ?? null,
              quantity: set.quantity,
              unitPrice,
              unitCost: part?.unitCost ?? 0,
              total: Math.round(unitPrice * set.quantity * 100) / 100,
              inventoryPartId: part?.id ?? null,
            },
          })
        }
        if (labor.length > 0) {
          await tx.serviceLabor.createMany({
            data: labor.map((line) => ({ ...line, serviceRecordId: record.id })),
          })
        }

        // Only claim the job if it is not already about another set, so
        // adding a second set never quietly rewrites the first one's link.
        if (!record.tireSetId) {
          await tx.serviceRecord.update({
            where: { id: record.id },
            data: { tireSetId: set.id },
          })
        }

        await retotalServiceRecord(record.id, tx)
      })

      revalidatePath(`/tire-hotel/${set.id}`)
      if (record.vehicleId) revalidatePath(`/vehicles/${record.vehicleId}`)
      return {
        id: record.id,
        invoiceNumber: record.invoiceNumber,
        vehicleId: record.vehicleId,
        tireSetId: set.id,
        reference: set.reference,
      }
    },
    {
      requiredPermissions: JOB,
      audit: ({ result }) => ({
        action: 'tire_set.add_to_work_order',
        entity: 'ServiceRecord',
        entityId: result.id,
        message: `Added tire set ${result.reference ?? result.tireSetId} to work order ${result.invoiceNumber ?? result.id}`,
        metadata: { tireSetId: result.tireSetId },
      }),
    }
  )
}

/**
 * Takes the tire set off a job.
 *
 * Only the link goes. The parts and labour lines stay, because they are what
 * is being charged and someone may have edited them since; deciding on the
 * operator's behalf that a billed line should vanish would be a worse
 * surprise than leaving it visible for them to remove.
 *
 * The shelf written into the job notes also stays. It is free text by now and
 * may have been added to, so rewriting it is not this action's business.
 */
export async function unlinkTireSetFromWorkOrder(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const record = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: {
          id: true,
          invoiceNumber: true,
          vehicleId: true,
          tireSet: { select: { id: true, reference: true } },
        },
      })
      if (!record) throw new Error('Work order not found')
      if (!record.tireSet) throw new Error('This job is not linked to a tire set')

      await db.serviceRecord.update({
        where: { id: record.id },
        data: { tireSetId: null },
      })

      revalidatePath(`/tire-hotel/${record.tireSet.id}`)
      if (record.vehicleId) {
        revalidatePath(`/vehicles/${record.vehicleId}/service/${record.id}`)
      }
      return {
        id: record.id,
        invoiceNumber: record.invoiceNumber,
        tireSetId: record.tireSet.id,
        reference: record.tireSet.reference,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'tire_set.unlink_work_order',
        entity: 'ServiceRecord',
        entityId: result.id,
        message: `Unlinked tire set ${result.reference ?? result.tireSetId} from work order ${result.invoiceNumber ?? result.id}`,
        metadata: { tireSetId: result.tireSetId },
      }),
    }
  )
}

/**
 * Stored sets belonging to one vehicle.
 *
 * Returns nothing when the module is off rather than throwing, since the
 * vehicle page is not a tire hotel screen and should not fail because a
 * feature it does not depend on is disabled.
 */
export async function getTireSetsForVehicle(vehicleId: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (!(await isTireHotelEnabled(organizationId))) return []

      return db.tireSet.findMany({
        where: { vehicleId, organizationId },
        // Stored first: a released set is history, and the question on a
        // vehicle page is almost always about tires that are still here.
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 10,
        select: {
          id: true,
          reference: true,
          season: true,
          size: true,
          quantity: true,
          status: true,
          location: { select: { code: true } },
          measurements: {
            orderBy: { measuredAt: 'desc' },
            take: 8,
            select: { condition: true },
          },
          treatments: { select: { type: true, status: true } },
        },
      })
    },
    { requiredPermissions: READ }
  )
}

/** Quotes and jobs already raised for a set, for the detail page. */
export async function getJobsForSet(tireSetId: string) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)

      const [quotes, workOrders] = await Promise.all([
        db.quote.findMany({
          where: { tireSetId, organizationId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            convertedToId: true,
          },
        }),
        db.serviceRecord.findMany({
          where: { tireSetId, organizationId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            serviceDate: true,
            vehicleId: true,
          },
        }),
      ])

      return { quotes, workOrders }
    },
    { requiredPermissions: READ }
  )
}
