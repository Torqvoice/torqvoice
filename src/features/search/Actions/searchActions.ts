'use server'

import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'

export async function getRecentCustomers() {
  return withAuth(
    async ({ organizationId }) => {
      const customers = await db.customer.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      })
      return customers
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    }
  )
}

export async function globalSearch(query: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (!query || query.trim().length < 2) {
        return {
          vehicles: [],
          customers: [],
          services: [],
          parts: [],
          quotes: [],
          reminders: [],
          inspections: [],
          tireSets: [],
        }
      }

      const q = query.trim()
      const mode = 'insensitive' as Prisma.QueryMode
      const words = q.split(/\s+/).filter(Boolean)
      // Digits-only version for phone matching (strips +, spaces, dashes, parens)
      const digitsOnly = q.replace(/[\s\-\+\(\)]/g, '')
      const isPhoneLike = /^\d{3,}$/.test(digitsOnly)

      // For multi-word queries, each word must match at least one field (AND logic).
      // For single-word queries, behavior is the same as before.

      const vehicleWhere: Prisma.VehicleWhereInput = {
        organizationId,
        AND: words.map((word) => {
          const or: Prisma.VehicleWhereInput[] = [
            { make: { contains: word, mode } },
            { model: { contains: word, mode } },
            { licensePlate: { contains: word, mode } },
            { vin: { contains: word, mode } },
            { customer: { name: { contains: word, mode } } },
          ]
          if (!isNaN(Number(word))) {
            or.push({ year: Number(word) })
          }
          return { OR: or }
        }),
      }

      // Tire sets are looked up at the desk by plate, customer or shelf code —
      // "where are the Hansen tires" is the question, and the answer is a shelf.
      // Only searched when the module is on, so a shop without it pays nothing.
      const tireHotelOn = await isTireHotelEnabled(organizationId)

      const [vehicles, customers, services, parts, quotes, reminders, inspections, tireSets] =
        await Promise.all([
          db.vehicle.findMany({
            where: vehicleWhere,
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
            take: 10,
          }),
          (async () => {
            // For phone-like queries, use raw SQL to strip formatting before matching
            if (isPhoneLike) {
              const phoneCustomers = await db.$queryRaw<
                {
                  id: string
                  name: string
                  email: string | null
                  phone: string | null
                  company: string | null
                }[]
              >`
            SELECT id, name, email, phone, company
            FROM customers
            WHERE "organizationId" = ${organizationId}
              AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE ${'%' + digitsOnly + '%'}
            LIMIT 10
          `
              // Fetch vehicles for matched customers
              const customerIds = phoneCustomers.map((c) => c.id)
              const customerVehicles =
                customerIds.length > 0
                  ? await db.vehicle.findMany({
                      where: { customerId: { in: customerIds }, isArchived: false },
                      select: {
                        id: true,
                        make: true,
                        model: true,
                        year: true,
                        licensePlate: true,
                        customerId: true,
                      },
                      take: 25,
                      orderBy: { updatedAt: 'desc' },
                    })
                  : []
              return phoneCustomers.map((c) => ({
                ...c,
                vehicles: customerVehicles
                  .filter((v) => v.customerId === c.id)
                  .slice(0, 5)
                  .map(({ customerId: _, ...v }) => v),
              }))
            }
            // Standard text search
            return db.customer.findMany({
              where: {
                organizationId,
                AND: words.map((word) => ({
                  OR: [
                    { name: { contains: word, mode } },
                    { email: { contains: word, mode } },
                    { phone: { contains: word, mode } },
                    { company: { contains: word, mode } },
                  ],
                })),
              },
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                company: true,
                vehicles: {
                  where: { isArchived: false },
                  select: {
                    id: true,
                    make: true,
                    model: true,
                    year: true,
                    licensePlate: true,
                  },
                  take: 5,
                  orderBy: { updatedAt: 'desc' },
                },
              },
              take: 10,
            })
          })(),
          db.serviceRecord.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { title: { contains: word, mode } },
                  { invoiceNumber: { contains: word, mode } },
                  { techName: { contains: word, mode } },
                ],
              })),
            },
            select: {
              id: true,
              title: true,
              invoiceNumber: true,
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
            take: 10,
          }),
          db.inventoryPart.findMany({
            where: {
              organizationId,
              isArchived: false,
              AND: words.map((word) => ({
                OR: [
                  { name: { contains: word, mode } },
                  { partNumber: { contains: word, mode } },
                  { supplier: { contains: word, mode } },
                ],
              })),
            },
            select: {
              id: true,
              name: true,
              partNumber: true,
              quantity: true,
              unit: true,
            },
            take: 10,
          }),
          db.quote.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { title: { contains: word, mode } },
                  { quoteNumber: { contains: word, mode } },
                  { customer: { name: { contains: word, mode } } },
                ],
              })),
            },
            select: {
              id: true,
              title: true,
              quoteNumber: true,
              status: true,
            },
            take: 10,
          }),
          db.reminder.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { title: { contains: word, mode } },
                  { description: { contains: word, mode } },
                  { vehicle: { make: { contains: word, mode } } },
                  { vehicle: { model: { contains: word, mode } } },
                  { vehicle: { licensePlate: { contains: word, mode } } },
                  { customer: { name: { contains: word, mode } } },
                ],
              })),
            },
            select: {
              id: true,
              title: true,
              dueDate: true,
              isCompleted: true,
              customer: { select: { id: true, name: true } },
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
            take: 10,
          }),
          db.inspection.findMany({
            where: {
              organizationId,
              AND: words.map((word) => ({
                OR: [
                  { template: { name: { contains: word, mode } } },
                  { notes: { contains: word, mode } },
                  { vehicle: { make: { contains: word, mode } } },
                  { vehicle: { model: { contains: word, mode } } },
                  { vehicle: { licensePlate: { contains: word, mode } } },
                ],
              })),
            },
            select: {
              id: true,
              status: true,
              createdAt: true,
              template: { select: { name: true } },
              vehicle: {
                select: {
                  id: true,
                  make: true,
                  model: true,
                  year: true,
                  licensePlate: true,
                },
              },
            },
            take: 10,
          }),
          tireHotelOn
            ? db.tireSet.findMany({
                where: {
                  organizationId,
                  AND: words.map((word) => ({
                    OR: [
                      { reference: { contains: word, mode } },
                      { brand: { contains: word, mode } },
                      { size: { contains: word, mode } },
                      { location: { code: { contains: word, mode } } },
                      { customer: { name: { contains: word, mode } } },
                      { vehicle: { make: { contains: word, mode } } },
                      { vehicle: { model: { contains: word, mode } } },
                      { vehicle: { licensePlate: { contains: word, mode } } },
                    ],
                  })),
                },
                select: {
                  id: true,
                  reference: true,
                  season: true,
                  size: true,
                  quantity: true,
                  status: true,
                  location: { select: { code: true } },
                  customer: { select: { id: true, name: true } },
                  vehicle: {
                    select: {
                      id: true,
                      make: true,
                      model: true,
                      year: true,
                      licensePlate: true,
                    },
                  },
                },
                // Stored sets first: a released set is history, and the desk is
                // almost always asking about something still on a shelf.
                orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
                take: 10,
              })
            : Promise.resolve([]),
        ])

      return { vehicles, customers, services, parts, quotes, reminders, inspections, tireSets }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.DASHBOARD },
      ],
    }
  )
}
