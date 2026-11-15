'use server'

import { offeredPaymentProviders } from '@/features/integrations/Lib/payments'
import { getPortalThreadPreview } from '@/features/portal/Lib/chat.server'
import { EMPTY_THREAD_PREVIEW } from '@/features/portal/Lib/chatTypes'
import { PORTAL_JOB_STATUSES, buildPortalHome } from '@/features/portal/Lib/homeData'
import type { PortalHomeData } from '@/features/portal/Lib/homeTypes'
import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { SENT_TO_CUSTOMER } from '@/features/portal/Lib/quoteVisibility'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { workshopTimeZone } from '@/lib/workshop-timezone'

const vehicle = { select: { id: true, make: true, model: true, licensePlate: true } } as const

/**
 * A side fetch the home can do without: whether paying online is on, the
 * chat, stored tyres. A failure there costs a button or a block, never the
 * page.
 */
async function quietly<T>(what: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (error) {
    console.error(`[getPortalHome] ${what} failed:`, error)
    return fallback
  }
}

/**
 * Everything the portal home shows, for the signed-in customer: the work on
 * their cars, what they owe, what waits for their answer, when they are next
 * expected, their cars, the tyres the workshop stores for them, what they
 * asked for, and the end of their chat with the workshop. One load, drawn by
 * whichever theme the workshop chose.
 *
 * `orgParam` is only what the links are written with (the slug or id in the
 * address); whose data is read comes from the session alone.
 */
export async function getPortalHome(orgParam: string): Promise<PortalResult<PortalHomeData>> {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    // The address must be this customer's workshop, or its links would be
    // written for another one.
    const org = await resolvePortalOrg(orgParam)
    if (!org || org.id !== organizationId) throw new Error('Not authenticated')

    const now = new Date()
    const mine = { organizationId, OR: [{ vehicle: { customerId } }, { customerId }] }
    const look = await loadPortalLook(organizationId)

    const [
      customer,
      workshop,
      timeZone,
      jobs,
      invoices,
      quotes,
      requests,
      appointments,
      cars,
      warranties,
      tires,
      thread,
      providers,
    ] = await Promise.all([
      db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { name: true },
      }),
      loadPortalWorkshop(organizationId, org.name),
      workshopTimeZone(organizationId),
      // Work that is booked or under way. 'scheduled' belongs here: a job
      // with a time on the board is exactly what a customer looks for.
      db.serviceRecord.findMany({
        where: { ...mine, status: { in: [...PORTAL_JOB_STATUSES] } },
        select: {
          id: true,
          title: true,
          status: true,
          startDateTime: true,
          promisedAt: true,
          createdAt: true,
          vehicle,
          // Only updates that reached the customer: sent, or opened from a
          // link. A draft or an unsent video is the workshop's own.
          statusReports: {
            where: {
              organizationId,
              OR: [{ sentAt: { not: null } }, { status: { in: ['sent', 'viewed'] } }],
            },
            select: {
              id: true,
              publicToken: true,
              message: true,
              sentAt: true,
              viewedAt: true,
              createdAt: true,
              expiresAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      // Finished work that may still be owed on. Which of it is paid is
      // worked out from the payments, which a query cannot sum per row.
      db.serviceRecord.findMany({
        where: { ...mine, status: 'completed', manuallyPaid: false },
        select: {
          id: true,
          title: true,
          invoiceNumber: true,
          totalAmount: true,
          manuallyPaid: true,
          serviceDate: true,
          invoiceDate: true,
          invoiceDueDate: true,
          publicToken: true,
          vehicle,
          payments: { select: { amount: true } },
        },
      }),
      db.quote.findMany({
        where: { customerId, organizationId, ...SENT_TO_CUSTOMER, status: 'sent' },
        select: {
          id: true,
          title: true,
          quoteNumber: true,
          status: true,
          totalAmount: true,
          validUntil: true,
          vehicle,
        },
      }),
      db.serviceRequest.findMany({
        where: { customerId, organizationId, status: 'pending' },
        select: {
          id: true,
          description: true,
          preferredDate: true,
          createdAt: true,
          vehicle,
        },
      }),
      // Appointments the workshop made with this customer that are still to
      // come. Only the title and time: the description is the workshop's own.
      quietly(
        'appointments',
        () =>
          db.appointment.findMany({
            where: { organizationId, customerId, endAt: { gte: now } },
            select: { id: true, title: true, startAt: true, vehicle },
            orderBy: { startAt: 'asc' },
            take: 5,
          }),
        []
      ),
      db.vehicle.findMany({
        where: { customerId, organizationId, isArchived: false },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          mileage: true,
          _count: { select: { serviceRecords: true } },
        },
      }),
      // Finished work whose warranty has an end date that has not passed.
      quietly(
        'warranties',
        () =>
          db.serviceRecord.findMany({
            where: {
              organizationId,
              status: 'completed',
              vehicle: { customerId, isArchived: false },
              warrantyExpiresAt: { gte: now },
            },
            select: {
              vehicleId: true,
              warrantyExpiresAt: true,
              warrantyMileage: true,
              mileage: true,
            },
          }),
        []
      ),
      // Tyres in storage, only when the workshop runs a tyre hotel and shows
      // it to customers. Never the shelf they sit on or the workshop's notes.
      look.showTires
        ? quietly(
            'stored tyres',
            () =>
              db.tireSet.findMany({
                where: {
                  organizationId,
                  status: 'stored',
                  OR: [{ customerId }, { vehicle: { customerId } }],
                },
                select: {
                  id: true,
                  season: true,
                  studded: true,
                  brand: true,
                  model: true,
                  size: true,
                  quantity: true,
                  withRims: true,
                  checkedInAt: true,
                  createdAt: true,
                  vehicle,
                  measurements: {
                    select: { treadDepthMm: true, measuredAt: true, movementId: true },
                    orderBy: { measuredAt: 'desc' },
                    take: 12,
                  },
                },
                orderBy: { createdAt: 'desc' },
              }),
            []
          )
        : null,
      look.messagesEnabled
        ? quietly(
            'messages',
            () => getPortalThreadPreview(organizationId, customerId),
            EMPTY_THREAD_PREVIEW
          )
        : EMPTY_THREAD_PREVIEW,
      quietly('payment providers', () => offeredPaymentProviders(organizationId), []),
    ])

    if (!customer) throw new Error('Customer not found')

    const { marine, ...workshopInfo } = workshop
    return buildPortalHome({
      orgParam,
      timeZone,
      now,
      customerName: customer.name,
      marine,
      workshop: workshopInfo,
      onlinePayment: providers.length > 0,
      jobs,
      invoices,
      quotes,
      requests,
      appointments,
      cars: cars.map(({ _count, ...car }) => ({ ...car, visits: _count.serviceRecords })),
      warranties,
      tires,
      messages: {
        enabled: look.messagesEnabled,
        unread: thread.unread,
        latest: thread.messages,
      },
    })
  })
}
