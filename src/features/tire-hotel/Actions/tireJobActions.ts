'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { calculateTotals } from '@/lib/tax'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { matchStock, parseTireSize, formatTireSize } from '../Lib/tireMatching'
import { requireTireHotel } from '../Lib/tireHotelSettings'

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
    },
  })
  if (!set) throw new Error('Tire set not found')
  return set
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
export async function getStockMatchesForSet(tireSetId: string) {
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
      const lineTotal = Math.round(unitPrice * set.quantity * 100) / 100
      const { taxAmount, totalAmount } = calculateTotals({
        subtotal: lineTotal,
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
          subtotal: lineTotal,
          taxRate,
          taxAmount,
          taxInclusive,
          totalAmount,
          customerId: set.customerId,
          vehicleId: set.vehicleId,
          tireSetId: set.id,
          organizationId,
          userId,
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
