'use server'

import { workshopTimeZone } from '@/lib/workshop-timezone'
import { getTranslations } from 'next-intl/server'
import { zonedDayKey } from '@/lib/timezone'
import type { DayHours } from '@/features/workshop-calendar/Lib/calendar'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { addDays, dayState } from '@/features/workshop-calendar/Lib/calendar'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { db } from '@/lib/db'
import { readPortalOpeningHours } from '@/features/portal/Lib/openingHours.server'
import { withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { SENT_TO_CUSTOMER } from '@/features/portal/Lib/quoteVisibility'
import { notify } from '@/lib/notify'
import { sendServiceRequestAlert } from '@/features/portal/Lib/sendServiceRequestAlert'
import { headers } from 'next/headers'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { visitConditionMapIn } from '@/features/condition-map/Lib/loadMarks.server'
import { linkedCertificateInspectionId } from '@/features/inspections/Lib/linkedCertificate.server'
import { assembleInvoicePrint } from '@/features/invoices/Lib/assembleInvoicePrint'
import { documentCustomerId, telegramQrForPrint } from '@/features/invoices/Lib/telegramQr'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { getFeatures } from '@/lib/features'
import { getTorqvoiceLogoDataUri } from '@/lib/torqvoice-branding'
import { gateTypeKey, isTypeKeyEnabled } from '@/features/vehicles/Lib/typeKeySetting'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { PORTAL_REQUEST_MAX_FILES } from '@/features/portal/Lib/portalUploads'
import { ownPortalUploadUrl } from '@/features/portal/Lib/portalUploadOwner.server'

// ─── Vehicles ─────────────────────────────────────────────────────────────

export async function getPortalVehicles() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const vehicles = await db.vehicle.findMany({
      where: { customerId, organizationId, isArchived: false },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        color: true,
        // The workshop's vehicle photo is internal — never sent to customers.
        _count: {
          select: {
            serviceRecords: true,
            inspections: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return vehicles
  })
}

export async function getPortalVehicleDetail(vehicleId: string) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const vehicle = await db.vehicle.findFirst({
      // An archived vehicle is gone from the list, so it is gone from here too.
      where: { id: vehicleId, customerId, organizationId, isArchived: false },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        // When the customer said the vehicle is no longer theirs.
        soldReportedAt: true,
        vin: true,
        licensePlate: true,
        hsn: true,
        tsn: true,
        color: true,
        mileage: true,
        fuelType: true,
        transmission: true,
        serviceRecords: {
          select: {
            id: true,
            title: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            serviceDate: true,
            startDateTime: true,
            publicToken: true,
            mileage: true,
            warrantyMonths: true,
            warrantyMileage: true,
            warrantyExpiresAt: true,
            warrantyNotes: true,
          },
          orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
        },
        inspections: {
          select: {
            id: true,
            status: true,
            completedAt: true,
            publicToken: true,
            createdAt: true,
            template: { select: { name: true } },
            items: { select: { condition: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!vehicle) {
      throw new Error('Vehicle not found')
    }

    return gateTypeKey(vehicle, await isTypeKeyEnabled(organizationId))
  })
}

/**
 * The tyres the workshop stores for one of the customer's vehicles, for that
 * vehicle's page. Nothing when the workshop has no tyre hotel or keeps it out
 * of the portal: the same switch the home reads (`PortalLook.showTires`).
 */
export async function getPortalVehicleTires(vehicleId: string) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const look = await loadPortalLook(organizationId)
    if (!look.showTires) return []
    const sets = await db.tireSet.findMany({
      where: { organizationId, status: 'stored', vehicleId, vehicle: { customerId } },
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
      },
      orderBy: { createdAt: 'desc' },
    })
    return sets.map(({ checkedInAt, createdAt, ...set }) => ({
      ...set,
      storedSince: (checkedInAt ?? createdAt).toISOString(),
    }))
  })
}

// ─── Invoices ─────────────────────────────────────────────────────────────

export async function getPortalInvoices() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    // Only completed records are surfaced as "invoices" to customers.
    // In-progress / pending / waiting-parts records are work orders, not
    // invoices, and showing them here causes confusion (prices may still
    // change, customer can't act on them).
    const invoices = await db.serviceRecord.findMany({
      where: {
        organizationId,
        OR: [{ vehicle: { customerId } }, { customerId }],
        status: 'completed',
      },
      select: {
        id: true,
        title: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        serviceDate: true,
        startDateTime: true,
        // The date printed on the invoice and the day it is due.
        invoiceDate: true,
        invoiceDueDate: true,
        publicToken: true,
        manuallyPaid: true,
        vehicle: { select: { make: true, model: true } },
        payments: { select: { amount: true } },
      },
      orderBy: [{ startDateTime: { sort: 'desc', nulls: 'last' } }, { serviceDate: 'desc' }],
    })
    return invoices
  })
}

/**
 * One invoice as the sheet the customer would be printed, for reading in the
 * portal without downloading the PDF. The same assembly and spec the PDF and
 * the shared copy come from, so the three cannot disagree. Only the
 * customer's own completed records, the same rule as the list.
 */
export async function getPortalInvoiceSheet(invoiceId: string) {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const record = await db.serviceRecord.findFirst({
      where: {
        id: invoiceId,
        organizationId,
        OR: [{ vehicle: { customerId } }, { customerId }],
        status: 'completed',
      },
      select: { id: true, title: true, invoiceNumber: true, publicToken: true },
    })
    if (!record) return null

    const assembly = await assembleInvoicePrint(record.id)
    if (!assembly) return null

    const acceptLanguage = (await headers()).get('accept-language')
    const locale = await resolveCustomerLocale(organizationId, acceptLanguage)
    const [labels, features, telegramQr, conditionMap, certificateInspection] = await Promise.all([
      loadPrintLabels(locale, assembly.labelSettings),
      getFeatures(organizationId),
      telegramQrForPrint(
        organizationId,
        assembly.layoutConfig,
        documentCustomerId(assembly.record)
      ),
      visitConditionMapIn(organizationId, assembly.conditionMap, locale),
      linkedCertificateInspectionId(organizationId, assembly.record.inspectionId),
    ])
    const torqvoiceLogoDataUri = features.brandingRemoved
      ? undefined
      : await getTorqvoiceLogoDataUri()

    const spec = buildInvoicePrintSpec({
      data: assembly.data,
      workshop: assembly.workshop,
      invoiceSettings: assembly.invoiceSettings,
      paymentSummary: assembly.paymentSummary,
      logoDataUri: assembly.logoDataUri,
      signer: assembly.signer,
      template: assembly.template,
      torqvoiceLogoDataUri,
      telegramQrDataUri: telegramQr?.dataUri,
      telegramLabel: labels?.telegramConnect,
      labels,
      locale,
      conditionMap,
      inspectionResults: assembly.inspectionResults,
    })

    return {
      id: record.id,
      title: record.title,
      invoiceNumber: record.invoiceNumber,
      publicToken: record.publicToken,
      spec,
      // The finished inspection linked to the job, whose certificate goes with it.
      hasCertificate: certificateInspection !== null,
    }
  })
}

// ─── Quotes ───────────────────────────────────────────────────────────────

export async function getPortalQuotes() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const quotes = await db.quote.findMany({
      where: { customerId, organizationId, ...SENT_TO_CUSTOMER },
      select: {
        id: true,
        title: true,
        quoteNumber: true,
        status: true,
        totalAmount: true,
        validUntil: true,
        publicToken: true,
        vehicle: { select: { make: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return quotes
  })
}

// ─── Inspections ──────────────────────────────────────────────────────────

export async function getPortalInspections() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const inspections = await db.inspection.findMany({
      where: {
        vehicle: { customerId, organizationId },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        publicToken: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true, licensePlate: true } },
        template: { select: { name: true } },
        items: { select: { condition: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return inspections
  })
}

// ─── Service Requests ─────────────────────────────────────────────────────

/** The longest description a request carries; the form's field stops there too. */
const MAX_REQUEST_DESCRIPTION = 4000

export async function createServiceRequest(input: {
  vehicleId?: string
  /**
   * A vehicle the workshop doesn't know yet. It is created on the customer's
   * profile so the request — and everything downstream (work orders, history)
   * — hangs off a real vehicle record from day one.
   */
  newVehicle?: {
    make: string
    model: string
    year?: number
    licensePlate?: string
  }
  description: string
  preferredDate?: string
  /** The part of that day that suits: only kept with a day. */
  preferredTime?: 'morning' | 'afternoon'
  /**
   * Photos and video the customer added, as the stored urls the portal's
   * upload route answered with. Anything else is refused.
   */
  attachments?: string[]
}) {
  return withPortalAuth(
    async ({ customerId, organizationId }) => {
      const description = typeof input.description === 'string' ? input.description.trim() : ''
      if (!description) throw new Error('A description is required')
      if (description.length > MAX_REQUEST_DESCRIPTION)
        throw new Error('The description is too long')

      // Only files this customer uploaded themselves, each once, and no more
      // than the form allows: a request can never point at another workshop's
      // file, at one of the workshop's own, or at another customer's upload
      // (the file route serves a file to whoever has a request that names it).
      const named = Array.isArray(input.attachments) ? input.attachments : []
      if (named.length > PORTAL_REQUEST_MAX_FILES * 2) throw new Error('Too many files')
      const stored = named.map((url) => ownPortalUploadUrl(url, organizationId, customerId))
      if (stored.some((url) => url === null)) {
        throw new Error('A file in this request is not one you uploaded')
      }
      const attachments = [...new Set(stored as string[])]
      if (attachments.length > PORTAL_REQUEST_MAX_FILES) throw new Error('Too many files')

      // A preferred day the workshop is closed on (a holiday, a closure, a day
      // it never opens) is refused before anything is created. The day checked
      // is the one stored, whatever form the date came in ("2027-01-26" or
      // "2027-01-26T12:00").
      const timeZone = await workshopTimeZone(organizationId)
      const preferredDate = toSafeWorkshopDate(input.preferredDate, timeZone) ?? null
      const preferredTime =
        preferredDate && (input.preferredTime === 'morning' || input.preferredTime === 'afternoon')
          ? input.preferredTime
          : null
      if (preferredDate) {
        const day = zonedDayKey(preferredDate, timeZone)
        const { calendar } = await loadWorkshopCalendar(organizationId, { from: day, to: day })
        const state = dayState(calendar, day)
        if (!state.open) {
          const tc = await getTranslations('workshopCalendar.portal')
          throw new Error(
            state.closures.length > 0
              ? tc('closedDay', { name: state.closures.map((c) => c.name).join(', ') })
              : tc('closedWeekday')
          )
        }
      }

      let vehicle: { id: string; make: string; model: string; licensePlate: string | null } | null =
        null

      if (input.vehicleId) {
        // Validate vehicle belongs to customer
        vehicle = await db.vehicle.findFirst({
          where: { id: input.vehicleId, customerId, organizationId },
          select: { id: true, make: true, model: true, licensePlate: true },
        })
      } else if (input.newVehicle) {
        const make = input.newVehicle.make?.trim().slice(0, 60)
        const model = input.newVehicle.model?.trim().slice(0, 60)
        const licensePlate = input.newVehicle.licensePlate?.trim().slice(0, 20) || null
        const currentYear = new Date().getFullYear()
        const year =
          Number.isInteger(input.newVehicle.year) &&
          (input.newVehicle.year as number) >= 1900 &&
          (input.newVehicle.year as number) <= currentYear + 1
            ? (input.newVehicle.year as number)
            : currentYear
        if (!make || !model) {
          throw new Error('Vehicle make and model are required')
        }
        // Vehicles carry an owning app user; portal customers are not users, so
        // the record is filed under the organization's owner.
        const ownerMember = await db.organizationMember.findFirst({
          where: { organizationId, role: 'owner' },
          select: { userId: true },
        })
        const anyMember =
          ownerMember ??
          (await db.organizationMember.findFirst({
            where: { organizationId },
            select: { userId: true },
          }))
        if (!anyMember) {
          throw new Error('Organization has no members')
        }
        vehicle = await db.vehicle.create({
          data: {
            make,
            model,
            year,
            licensePlate,
            userId: anyMember.userId,
            organizationId,
            customerId,
          },
          select: { id: true, make: true, model: true, licensePlate: true },
        })
      }

      if (!vehicle) {
        throw new Error('Vehicle not found')
      }

      const customer = await db.customer.findUnique({
        where: { id: customerId },
        select: { name: true, email: true, phone: true },
      })

      const serviceRequest = await db.serviceRequest.create({
        data: {
          description,
          preferredDate,
          preferredTime,
          attachments,
          customerId,
          vehicleId: vehicle.id,
          organizationId,
        },
      })

      // Notify staff
      const vehicleName = `${vehicle.make} ${vehicle.model}`
      const customerName = customer?.name ?? 'A customer'
      // The plate is what the workshop actually looks a car up by, so it goes in
      // the email even though the in-app message stays short.
      const vehicleLabel = vehicle.licensePlate
        ? `${vehicleName} (${vehicle.licensePlate})`
        : vehicleName

      await notify({
        organizationId,
        type: 'service_request',
        title: 'New Service Request',
        message: `${customerName} requested service for ${vehicleName}: ${description.slice(0, 100)}${
          attachments.length > 0 ? ` (${attachments.length} photos or videos attached)` : ''
        }`,
        entityType: 'service_request',
        entityId: serviceRequest.id,
        entityUrl: `/customers/${customerId}?tab=requests`,
      })

      // Email the workshop, if it asked to be emailed. Isolated on purpose: the
      // request is committed and the bell has already rung, so a misconfigured
      // mail provider must not surface to the customer as a failed submission.
      // sendServiceRequestAlert swallows its own errors; this is the backstop for
      // anything it cannot anticipate.
      try {
        await sendServiceRequestAlert({
          organizationId,
          customerId,
          customerName,
          customerEmail: customer?.email ?? null,
          customerPhone: customer?.phone ?? null,
          vehicleLabel,
          description,
          preferredDate: serviceRequest.preferredDate,
          preferredTime,
          attachmentCount: attachments.length,
        })
      } catch (error) {
        console.error('[createServiceRequest] alert email failed:', error)
      }

      return serviceRequest
    },
    { writes: true }
  )
}

export async function getPortalServiceRequests() {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const requests = await db.serviceRequest.findMany({
      where: { customerId, organizationId },
      select: {
        id: true,
        description: true,
        preferredDate: true,
        preferredTime: true,
        attachments: true,
        status: true,
        adminNotes: true,
        createdAt: true,
        vehicle: { select: { make: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return requests
  })
}

// ─── Ownership ────────────────────────────────────────────────────────────

/**
 * The customer says the vehicle is no longer theirs. Nothing is archived
 * here: the vehicle is flagged, reminders about it stop, and the workshop
 * gets a notification so a person decides what to do with the record.
 */
export async function reportVehicleSold(vehicleId: string) {
  return withPortalAuth(
    async ({ customerId, organizationId }) => {
      const vehicle = await db.vehicle.findFirst({
        where: { id: vehicleId, customerId, organizationId, isArchived: false },
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          licensePlate: true,
          soldReportedAt: true,
        },
      })
      if (!vehicle) throw new Error('Vehicle not found')
      if (vehicle.soldReportedAt) return { reportedAt: vehicle.soldReportedAt.toISOString() }
      const now = new Date()
      await db.vehicle.update({ where: { id: vehicle.id }, data: { soldReportedAt: now } })
      const customer = await db.customer.findUnique({
        where: { id: customerId },
        select: { name: true },
      })
      const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ''}`
      await notify({
        organizationId,
        type: 'vehicle_sold',
        title: 'Vehicle reported sold',
        message: `${customer?.name ?? 'A customer'} says ${label} is no longer theirs.`,
        entityType: 'vehicle',
        entityId: vehicle.id,
        entityUrl: `/vehicles/${vehicle.id}`,
      })
      return { reportedAt: now.toISOString() }
    },
    { writes: true }
  )
}

/** The workshop's week and what changes in it soon, for the customer to plan around. */
export interface PortalOpeningHours {
  /** Sunday first, as Date#getDay. */
  week: DayHours[]
  /** The workshop's today, "YYYY-MM-DD". */
  today: string
  timeFormat: '12h' | '24h'
  /**
   * Days soon that the workshop is shut or opens for less than usual, with
   * the hours it is still open ("HH:mm"; none when closed all day).
   */
  closedSoon: { date: string; name: string; open: { start: string; end: string }[] }[]
}

/**
 * Opening hours for the signed-in customer: the week, and the days soon the
 * workshop shuts or closes early. The front page reads the same thing.
 */
export async function getPortalOpeningHours() {
  return withPortalAuth(({ organizationId }) => readPortalOpeningHours(organizationId))
}

/**
 * The days in the coming weeks the workshop is closed for a holiday or
 * closure, so the request form can say so before a customer picks one.
 */
export async function getPortalClosedDays() {
  return withPortalAuth(async ({ organizationId }) => {
    const timeZone = await workshopTimeZone(organizationId)
    const today = zonedDayKey(new Date(), timeZone)
    const last = addDays(today, 90)
    const { calendar } = await loadWorkshopCalendar(organizationId, { from: today, to: last })
    // One entry per closed day, naming each holiday once whatever lists it.
    const days: { date: string; name: string }[] = []
    for (let day = today; day <= last; day = addDays(day, 1)) {
      const state = dayState(calendar, day)
      if (!state.open && state.closures.length > 0) {
        days.push({ date: day, name: state.closures.map((c) => c.name).join(', ') })
      }
    }
    return days
  })
}
