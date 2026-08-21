'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { calculateTotals } from '@/lib/tax'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { retotalServiceRecord } from '@/features/vehicles/Lib/retotalServiceRecord'
import { OPEN_SERVICE_STATUSES } from '@/lib/service-record'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import { addTireLineToRecord } from '../Lib/addTireLine'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import { matchStock, parseTireSize, formatTireSize, sizesMatch } from '../Lib/tireMatching'
import { TREATMENT_TYPES, billableTreatments, parseTreatmentPrices } from '../Lib/treatments'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { invoiceLineWords, jobNoteWords, seasonNames, treatmentNames } from '../Lib/serverMessages'
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
  /// How many tires the line covers. Defaults to the size of the stored set,
  /// which is the usual answer, but a customer replacing two of four should
  /// not have to fix the line afterwards.
  quantity: z.coerce.number().int().min(1).max(99).optional(),
  includeTreatments: z.array(z.enum(TREATMENT_TYPES)).optional(),
  /// The storage fee, billed on the same document as the work rather than on
  /// a schedule of its own. The period is not a rule, it is what prints on
  /// the line so the customer can see what they paid for.
  includeStorage: z.boolean().default(false),
  /// Copies the set's photos and documents onto the job, so they reach the
  /// invoice PDF the way any other attachment does.
  includeAttachments: z.boolean().default(true),
  /// Bills the customer directly instead of raising a job on a vehicle, for
  /// the customer who only ever stores tires and never brings the car in.
  asInvoice: z.boolean().default(false),
  storageAmount: z.coerce.number().min(0).max(1_000_000).optional(),
  storageFrom: z.coerce.date().optional(),
  storageTo: z.coerce.date().optional(),
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
      // Copied onto the job when the set is billed, so the invoice carries the
      // photos the technician took.
      attachments: {
        where: { includeInInvoice: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          description: true,
        },
      },
    },
  })
  if (!set) throw new Error('Tire set not found')
  return set
}

const searchSchema = z.object({
  tireSetId: z.string().min(1),
  query: z.string().trim().max(120),
})

/**
 * Free search of the parts catalogue from inside the job dialog.
 *
 * The fitment matches are a shortcut, not the answer. A shop carries a dozen
 * brands in the same size, sells a wider tire on request, and sometimes has
 * the right tire filed under a name no size parser will ever recognise, so
 * the operator needs to be able to go and find it.
 *
 * Terms are ANDed, which is how people search: "michelin 225" should mean
 * both, not either.
 */
export async function searchTireStock(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireTireHotel(organizationId)
      const data = searchSchema.parse(input)
      // One character matches most of the catalogue, which is not a search.
      if (data.query.length < 2) return []

      const set = await loadSet(organizationId, data.tireSetId)
      const terms = data.query.split(/\s+/).filter(Boolean).slice(0, 5)

      const parts = await db.inventoryPart.findMany({
        where: {
          organizationId,
          isArchived: false,
          AND: terms.map((term) => ({
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { partNumber: { contains: term, mode: 'insensitive' as const } },
              { description: { contains: term, mode: 'insensitive' as const } },
            ],
          })),
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
        take: 40,
      })

      const target = parseTireSize(set.size)
      return parts
        .map((part) => ({
          ...part,
          inStock: part.quantity >= set.quantity,
          // Whether it is the size on the shelf. Not a filter: selling the
          // customer something else is allowed, it just should not happen by
          // accident, so a mismatch is labelled rather than hidden. A set with
          // no size recorded has nothing to disagree with, so nothing is
          // flagged rather than everything.
          fits:
            !target ||
            sizesMatch(parseTireSize(part.name), target) ||
            sizesMatch(parseTireSize(part.partNumber), target) ||
            sizesMatch(parseTireSize(part.description), target),
        }))
        .sort((a, b) => {
          if (a.fits !== b.fits) return a.fits ? -1 : 1
          if (a.inStock !== b.inStock) return a.inStock ? -1 : 1
          return a.sellPrice - b.sellPrice
        })
        .slice(0, 20)
    },
    { requiredPermissions: READ }
  )
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
/**
 * The storage fee as a flat service line, in the workshop's language.
 *
 * Priced per job rather than by the hour, so it prints as one figure with the
 * period beside it. Nothing schedules this: it is charged when the tires are
 * billed, which is the moment somebody is looking at the account anyway.
 */
async function storageLine(
  set: { size: string | null; quantity: number },
  data: { storageAmount?: number; storageFrom?: Date; storageTo?: Date }
) {
  const amount = Math.round((data.storageAmount ?? 0) * 100) / 100
  const words = await invoiceLineWords()

  // An open-ended period is the normal case: the shop knows when the tires
  // arrived and not when they will be collected, and inventing an end date
  // would print a promise on the invoice.
  const from = data.storageFrom?.toISOString().slice(0, 10)
  const to = data.storageTo?.toISOString().slice(0, 10)
  const period = from ? (to ? `${from} - ${to}` : words.fromDate.replace('{date}', from)) : null

  return {
    description: [words.storage, set.size, `${set.quantity} ${words.pieces}`, period]
      .filter(Boolean)
      .join(' · '),
    hours: 1,
    rate: amount,
    total: amount,
    pricingType: 'service' as const,
  }
}

/**
 * Copies the set's files onto a job, so the invoice shows what the technician
 * saw.
 *
 * Pointing at the same files rather than duplicating the bytes: a photo of a
 * kerbed rim is one photo, and copying it would double the disk for every
 * season a set is billed. Removing it from the set later leaves the invoice
 * intact, which is the right way round for a document a customer may hold.
 */
async function copyAttachments(
  tx: Prisma.TransactionClient,
  serviceRecordId: string,
  files: {
    fileName: string
    fileUrl: string
    fileType: string
    fileSize: number
    description: string | null
  }[]
) {
  if (files.length === 0) return
  await tx.serviceAttachment.createMany({
    data: files.map((file) => ({
      serviceRecordId,
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      fileType: file.fileType,
      fileSize: file.fileSize,
      description: file.description,
      category: 'tire_hotel',
      includeInInvoice: true,
    })),
  })
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
/**
 * What to call a set on a quote, a work order or an invoice line.
 *
 * The season phrase is passed in rather than looked up here, so an action
 * resolves it once instead of once per line, and never inside a transaction.
 * Falls back to the raw season word if a locale is missing the phrase, which
 * reads oddly but still identifies the tires.
 */
function describeSet(
  set: {
    quantity: number
    season: string
    size: string | null
    brand: string | null
  },
  seasons: Record<string, string>
): string {
  const parsed = parseTireSize(set.size)
  const size = parsed ? formatTireSize(parsed) : set.size
  const season = seasons[set.season] ?? `${set.season} tires`
  return [`${set.quantity}x`, set.brand, size, season].filter(Boolean).join(' ')
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
      const seasons = await seasonNames()

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
        description: describeSet(set, seasons),
        matches: matchStock(candidates, set.size, set.quantity),
        // What the prep would add, so the dialog can list it and let the
        // operator drop any of it before it lands on the job.
        prep: await billablePrep(organizationId, set.treatments),
        // What would travel onto the document, so the dialog can say so and
        // let it be left off.
        attachments: set.attachments.length,
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
      const seasons = await seasonNames()

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
      const lineQuantity = data.quantity ?? set.quantity
      const lineTotal = data.includeTires ? Math.round(unitPrice * lineQuantity * 100) / 100 : 0
      const labor = await treatmentLines(organizationId, set.treatments, data.includeTreatments)
      if (data.includeStorage) labor.push(await storageLine(set, data))
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
          title: describeSet(set, seasons),
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
                      name: part?.name ?? describeSet(set, seasons),
                      partNumber: part?.partNumber ?? null,
                      quantity: lineQuantity,
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
      const seasons = await seasonNames()

      if (!data.asInvoice && !set.vehicleId) {
        throw new Error('Link a vehicle to this set before creating a work order')
      }
      if (data.asInvoice && !set.customerId) {
        throw new Error('Link a customer to this set before invoicing them')
      }

      // A work order hangs off the vehicle, so it reaches the board, the
      // vehicle history and the technician's day. A plain invoice does not,
      // which is exactly what a storage-only customer wants.
      const record = await createDraftRecord(
        { organizationId, userId },
        {
          vehicleId: data.asInvoice ? null : set.vehicleId,
          customerId: data.asInvoice ? set.customerId : null,
          customerExempt: set.customer?.taxExempt ?? false,
          title: describeSet(set, seasons),
        }
      )

      const part = data.inventoryPartId
        ? await db.inventoryPart.findFirst({
            where: { id: data.inventoryPartId, organizationId, isArchived: false },
            select: { id: true, name: true, partNumber: true, unitCost: true, sellPrice: true },
          })
        : null

      const unitPrice = data.unitPrice ?? part?.sellPrice ?? 0
      const lineQuantity = data.quantity ?? set.quantity
      const labor = await treatmentLines(organizationId, set.treatments, data.includeTreatments)
      if (data.includeStorage) labor.push(await storageLine(set, data))

      await db.$transaction(async (tx) => {
        // The tires themselves, which a quote and an add-to-existing already
        // put on the job. Without this the operator picks a tire and a price
        // and gets a work order with nothing but the prep on it.
        if (data.includeTires) {
          await addTireLineToRecord(tx, organizationId, userId, {
            serviceRecordId: record.id,
            name: part?.name ?? describeSet(set, seasons),
            partNumber: part?.partNumber ?? null,
            quantity: lineQuantity,
            unitPrice,
            unitCost: part?.unitCost ?? 0,
            inventoryPartId: part?.id ?? null,
            recordLabel: record.invoiceNumber || describeSet(set, seasons),
          })
        }

        // Independent of the lines: a job can carry the photos without
        // carrying a charge, which is what an inspection amounts to.
        if (data.includeAttachments) {
          await copyAttachments(tx, record.id, set.attachments)
        }

        if (labor.length > 0) {
          await tx.serviceLabor.createMany({
            data: labor.map((line) => ({ ...line, serviceRecordId: record.id })),
          })
        }

        if (data.includeTires || labor.length > 0) {
          await retotalServiceRecord(record.id, tx)
        }
      })

      if (data.includeTires && part) await onInventoryChanged(organizationId)

      const notes = await jobNoteWords()
      const shelf = set.location
        ? `${set.location.code} (${set.location.warehouse.name})`
        : (notes.notOnShelf ?? 'not on a shelf')

      await db.serviceRecord.update({
        where: { id: record.id },
        data: {
          tireSetId: set.id,
          // Repeated in the notes as well as the relation: the printed job
          // sheet and the PDF do not render the relation, and the shelf is
          // the one fact the technician needs before touching anything.
          diagnosticNotes: [
            (notes.set ?? 'Tire set {reference}')
              .replace('{reference}', set.reference ?? '')
              .trim(),
            (notes.shelf ?? 'Shelf: {shelf}').replace('{shelf}', shelf),
            set.withRims ? (notes.onRims ?? 'On rims') : (notes.tiresOnly ?? 'Tires only'),
            set.hasTpms ? (notes.tpms ?? 'Has TPMS sensors') : null,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      })

      if (set.vehicleId) revalidatePath(`/vehicles/${set.vehicleId}`)
      revalidatePath('/billing')
      revalidatePath(`/tire-hotel/${set.id}`)
      return {
        id: record.id,
        invoiceNumber: record.invoiceNumber,
        vehicleId: data.asInvoice ? null : set.vehicleId,
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
          status: { in: [...OPEN_SERVICE_STATUSES] },
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
    async ({ organizationId, userId }) => {
      await requireTireHotel(organizationId)
      const data = fromSetSchema.extend({ serviceRecordId: z.string().min(1) }).parse(input)
      const set = await loadSet(organizationId, data.tireSetId)
      const seasons = await seasonNames()

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
      const lineQuantity = data.quantity ?? set.quantity
      const labor = await treatmentLines(organizationId, set.treatments, data.includeTreatments)
      if (data.includeStorage) labor.push(await storageLine(set, data))

      await db.$transaction(async (tx) => {
        if (data.includeTires) {
          await addTireLineToRecord(tx, organizationId, userId, {
            serviceRecordId: record.id,
            name: part?.name ?? describeSet(set, seasons),
            partNumber: part?.partNumber ?? null,
            quantity: lineQuantity,
            unitPrice,
            unitCost: part?.unitCost ?? 0,
            inventoryPartId: part?.id ?? null,
            recordLabel: record.invoiceNumber || describeSet(set, seasons),
          })
        }
        // Independent of the lines: a job can carry the photos without
        // carrying a charge, which is what an inspection amounts to.
        if (data.includeAttachments) {
          await copyAttachments(tx, record.id, set.attachments)
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

      if (data.includeTires && part) await onInventoryChanged(organizationId)

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
