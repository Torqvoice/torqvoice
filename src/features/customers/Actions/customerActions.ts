'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { createCustomerSchema, updateCustomerSchema } from '../Schema/customerSchema'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getFeatures, FeatureGatedError } from '@/lib/features'
import { createDraftServiceRecord } from '@/features/vehicles/Actions/createDraftServiceRecord'
import { claimWhatsappMessagesForCustomer } from '@/lib/whatsapp'
import { serviceDateOrderBy } from '@/lib/date-sort'
import { clearedToNull } from '@/lib/clearable'

/**
 * A design a customer is being pointed at has to be this workshop's and an
 * invoice design; anything else is refused rather than stored.
 */
async function assertInvoiceDesign(organizationId: string, designId: string | null | undefined) {
  if (!designId) return
  const design = await db.documentDesign.findFirst({
    where: { id: designId, organizationId, documentType: 'invoice' },
    select: { id: true },
  })
  if (!design) throw new Error('Design not found')
}

export async function getCustomers() {
  return withAuth(
    async ({ userId, organizationId }) => {
      return db.customer.findMany({
        where: { organizationId },
        include: {
          _count: { select: { vehicles: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function getCustomer(customerId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        include: {
          // The name, so the page can say which design this customer's
          // invoices print with rather than only that one was chosen.
          invoiceDesign: { select: { id: true, name: true } },
          vehicles: {
            where: { isArchived: false },
            include: {
              _count: { select: { serviceRecords: true } },
            },
            orderBy: { updatedAt: 'desc' },
          },
          serviceRequests: {
            include: {
              vehicle: { select: { id: true, make: true, model: true, year: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })

      // Missing or foreign-org customer yields null rather than an error: the
      // page renders its not-found state, and this also runs during the
      // post-delete re-render of the customer route.
      return customer
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function createCustomer(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const features = await getFeatures(organizationId)
      const count = await db.customer.count({ where: { organizationId } })
      if (count >= features.maxCustomers) {
        throw new FeatureGatedError(
          'maxCustomers',
          'Customer limit reached. Upgrade your plan to add more customers.'
        )
      }

      const data = createCustomerSchema.parse(input)
      await assertInvoiceDesign(organizationId, data.invoiceDesignId)

      // Auto-assign the next sequential number when none was provided; the
      // per-org unique index guards against races and manual duplicates.
      let customerNumber = data.customerNumber?.trim() || null
      if (!customerNumber) {
        const existing = await db.customer.findMany({
          where: { organizationId, customerNumber: { not: null } },
          select: { customerNumber: true },
        })
        const max = existing.reduce((acc, c) => {
          const n = Number.parseInt(c.customerNumber ?? '', 10)
          return Number.isFinite(n) && n > acc ? n : acc
        }, 1000)
        customerNumber = String(max + 1)
      }

      try {
        const customer = await db.customer.create({
          data: {
            ...data,
            customerNumber,
            email: data.email || null,
            userId,
            organizationId,
          },
        })
        // Someone added from an unknown WhatsApp number keeps the thread that
        // prompted it.
        await claimWhatsappMessagesForCustomer(organizationId, customer.id, customer.phone)

        revalidatePath('/customers')
        return customer
      } catch (err: unknown) {
        if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
          throw new Error('Customer number is already in use')
        }
        throw err
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'customer.create',
        entity: 'Customer',
        entityId: result.id,
        details: { key: 'customer_create', params: { name: result.name } },
        metadata: { customerId: result.id },
      }),
    }
  )
}

export async function updateCustomer(input: unknown) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const { id, ...data } = updateCustomerSchema.parse(input)
      await assertInvoiceDesign(organizationId, data.invoiceDesignId)
      let result
      try {
        result = await db.customer.updateMany({
          where: { id, organizationId },
          // Fields left out of the input stay as they are; an emptied one
          // ('') is cleared.
          data: {
            ...data,
            customerNumber: clearedToNull(data.customerNumber),
            email: clearedToNull(data.email),
            company: clearedToNull(data.company),
            phone: clearedToNull(data.phone),
            address: clearedToNull(data.address),
            taxId: clearedToNull(data.taxId),
            notes: clearedToNull(data.notes),
          },
        })
      } catch (err: unknown) {
        if (err && typeof err === 'object' && (err as { code?: string }).code === 'P2002') {
          throw new Error('Customer number is already in use')
        }
        throw err
      }
      if (result.count === 0) throw new Error('Customer not found')
      if (data.phone) await claimWhatsappMessagesForCustomer(organizationId, id, data.phone)
      revalidatePath('/customers')
      revalidatePath(`/customers/${id}`)
      return { id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'customer.update',
        entity: 'Customer',
        entityId: result.id,
        details: { key: 'customer_update', params: { id: result.id } },
        metadata: { customerId: result.id },
      }),
    }
  )
}

export async function deleteCustomer(customerId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const result = await db.customer.deleteMany({ where: { id: customerId, organizationId } })
      if (result.count === 0) throw new Error('Customer not found')
      revalidatePath('/customers')
      return { customerId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'customer.delete',
        entity: 'Customer',
        entityId: result.customerId,
        details: { key: 'customer_delete', params: { id: result.customerId } },
        metadata: { customerId: result.customerId },
      }),
    }
  )
}

export async function deleteCustomers(customerIds: string[]) {
  return withAuth(
    async ({ userId, organizationId }) => {
      if (customerIds.length === 0) throw new Error('No customers selected')
      const result = await db.customer.deleteMany({
        where: { id: { in: customerIds }, organizationId },
      })
      revalidatePath('/customers')
      return { deleted: result.count }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/**
 * Assigns sequential numbers to every customer that has none, oldest first,
 * continuing after the highest existing numeric number (min 1001). Customers
 * that already have a number — auto or manual — are never touched.
 */
export async function backfillCustomerNumbers() {
  return withAuth(
    async ({ organizationId }) => {
      const [numbered, unnumbered] = await Promise.all([
        db.customer.findMany({
          where: { organizationId, customerNumber: { not: null } },
          select: { customerNumber: true },
        }),
        db.customer.findMany({
          where: { organizationId, customerNumber: null },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])

      let next =
        numbered.reduce((acc, c) => {
          const n = Number.parseInt(c.customerNumber ?? '', 10)
          return Number.isFinite(n) && n > acc ? n : acc
        }, 1000) + 1

      await db.$transaction(
        unnumbered.map((c) =>
          db.customer.update({
            where: { id: c.id },
            data: { customerNumber: String(next++) },
          })
        )
      )

      revalidatePath('/customers')
      revalidatePath('/settings/invoice')
      return { assigned: unnumbered.length }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
      audit: ({ result }) => ({
        action: 'customer.backfillNumbers',
        entity: 'Customer',
        details: { key: 'customer_backfillNumbers', params: { count: result.assigned } },
        metadata: { assigned: result.assigned },
      }),
    }
  )
}

export async function getCustomersPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
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

      if (params.search) {
        const words = params.search.trim().split(/\s+/).filter(Boolean)
        if (words.length > 1) {
          where.AND = words.map((word: string) => ({
            OR: [
              { name: { contains: word, mode: 'insensitive' } },
              { email: { contains: word, mode: 'insensitive' } },
              { phone: { contains: word, mode: 'insensitive' } },
              { company: { contains: word, mode: 'insensitive' } },
              { customerNumber: { contains: word, mode: 'insensitive' } },
            ],
          }))
        } else {
          where.OR = [
            { name: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
            { phone: { contains: params.search, mode: 'insensitive' } },
            { company: { contains: params.search, mode: 'insensitive' } },
            { customerNumber: { contains: params.search, mode: 'insensitive' } },
          ]
        }
      }

      const [customers, total] = await Promise.all([
        db.customer.findMany({
          where,
          include: {
            _count: { select: { vehicles: true } },
          },
          orderBy: (() => {
            const dir = params.sortOrder || 'desc'
            const nullable = { sort: dir, nulls: 'last' } as const
            switch (params.sortBy) {
              case 'number':
                return { customerNumber: { sort: dir, nulls: 'last' as const } }
              case 'name':
                return { name: dir }
              case 'company':
                return { company: nullable }
              case 'phone':
                return { phone: nullable }
              case 'email':
                return { email: nullable }
              case 'vehicles':
                return { vehicles: { _count: dir } }
              default:
                return { updatedAt: 'desc' as const }
            }
          })(),
          skip,
          take: pageSize,
        }),
        db.customer.count({ where }),
      ])

      return {
        customers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/**
 * Pending booking requests from the customer portal, newest first.
 *
 * These are customers asking for work. Until now they only reached the shop
 * as an alert on the way in and a tab on one customer's page, so a missed
 * alert meant a request nobody was looking for. The dashboard needs them in
 * one place, which is what this feeds.
 */
export async function getPendingServiceRequests(limit = 5) {
  return withAuth(
    async ({ organizationId }) => {
      return db.serviceRequest.findMany({
        where: { organizationId, status: 'pending' },
        select: {
          id: true,
          description: true,
          preferredDate: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
          vehicle: {
            select: { id: true, make: true, model: true, year: true, licensePlate: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function updateServiceRequest(
  requestId: string,
  data: { status?: string; adminNotes?: string }
) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const result = await db.serviceRequest.updateMany({
        where: { id: requestId, organizationId },
        data: { status: data.status, adminNotes: clearedToNull(data.adminNotes) },
      })
      if (result.count === 0) throw new Error('Service request not found')
      revalidatePath('/customers')
      return { id: requestId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function createWorkOrderFromRequest(requestId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const request = await db.serviceRequest.findFirst({
        where: { id: requestId, organizationId },
        include: { vehicle: { select: { id: true } } },
      })
      if (!request) throw new Error('Service request not found')
      if (request.status === 'converted')
        throw new Error('Work order already created for this request')

      const vehicleId = request.vehicleId
      const serviceDate = request.preferredDate ?? undefined

      const result = await createDraftServiceRecord(vehicleId, serviceDate)
      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to create work order')
      }
      const record = result.data

      const truncatedTitle =
        request.description.length > 60
          ? request.description.slice(0, 57) + '...'
          : request.description

      await db.serviceRecord.update({
        where: { id: record.id },
        data: {
          title: truncatedTitle,
          description: request.description,
        },
      })

      const existingNotes = request.adminNotes ? `${request.adminNotes}\n` : ''
      await db.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: 'converted',
          adminNotes: `${existingNotes}Work Order: ${record.id}`,
        },
      })

      revalidatePath('/customers')
      return { vehicleId, serviceRecordId: record.id }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function getCustomersList() {
  return withAuth(
    async ({ userId, organizationId }) => {
      return db.customer.findMany({
        where: { organizationId },
        select: { id: true, name: true, company: true },
        orderBy: { name: 'asc' },
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

export async function searchCustomers(search?: string, limit = 20, offset = 0) {
  return withAuth(
    async ({ organizationId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId }
      if (search) {
        const words = search.trim().split(/\s+/).filter(Boolean)
        if (words.length > 1) {
          // Every word must match in at least one field
          where.AND = words.map((word) => ({
            OR: [
              { name: { contains: word, mode: 'insensitive' } },
              { email: { contains: word, mode: 'insensitive' } },
              { phone: { contains: word, mode: 'insensitive' } },
              { company: { contains: word, mode: 'insensitive' } },
              { customerNumber: { contains: word, mode: 'insensitive' } },
            ],
          }))
        } else {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
          ]
        }
      }
      return db.customer.findMany({
        where,
        select: { id: true, name: true, company: true },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}

/// Every invoice belonging to a customer: the ones raised directly against
/// them (parts-only counter sales, which carry no vehicle) plus every invoice
/// on a vehicle they own. Without the OR, parts-only sales are invisible from
/// the customer page — the vehicle tab is the only way in and they have no
/// vehicle to sit under.
export async function getCustomerInvoices(customerId: string) {
  return withAuth(
    async ({ organizationId }) => {
      return db.serviceRecord.findMany({
        where: {
          organizationId,
          OR: [{ customerId }, { vehicle: { customerId } }],
        },
        select: {
          id: true,
          title: true,
          status: true,
          cost: true,
          totalAmount: true,
          invoiceNumber: true,
          invoiceDate: true,
          startDateTime: true,
          serviceDate: true,
          vehicleId: true,
          vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
        },
        orderBy: serviceDateOrderBy('desc'),
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_ORDERS },
      ],
    }
  )
}

/// Same reasoning as getCustomerInvoices: a quote is reachable either through
/// its own customer link or through the vehicle it was written for.
export async function getCustomerQuotes(customerId: string) {
  return withAuth(
    async ({ organizationId }) => {
      return db.quote.findMany({
        where: {
          organizationId,
          OR: [{ customerId }, { vehicle: { customerId } }],
        },
        select: {
          id: true,
          title: true,
          status: true,
          quoteNumber: true,
          totalAmount: true,
          createdAt: true,
          vehicle: { select: { make: true, model: true, year: true, licensePlate: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.QUOTES }],
    }
  )
}
