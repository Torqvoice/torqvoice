import { db } from '@/lib/db'
import {
  readWorkshopTax,
  taxFieldsForNewDocument,
  WORKSHOP_TAX_SETTING_KEYS,
} from '@/features/settings/Lib/workshopTax'
import { nextAvailableSlot } from '@/features/workboard/Lib/availability'
import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { atZonedTime, startOfZonedDay, zonedParts } from '@/lib/timezone'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  resolveWorkOrderTitle,
  workOrderTitleTemplateFrom,
  workOrderTitleValues,
} from './workOrderTitle'

/**
 * Shared draft-record creation for both work orders (with a vehicle) and
 * counter sales (no vehicle, direct customer link). Resolves invoice number,
 * default technician, tax settings and schedule times identically.
 */
/** How long a job is assumed to take until somebody says otherwise. */
const DEFAULT_JOB_MINUTES = 60

export async function createDraftRecord(
  { organizationId, userId }: { organizationId: string; userId: string },
  opts: {
    vehicleId: string | null
    customerId: string | null
    customerExempt: boolean
    /**
     * The job's title, or null to name it from the workshop's title template
     * once its number is known (see workOrderTitle.ts).
     */
    title: string | null
    startDateTime?: Date
    endDateTime?: Date
    technicianId?: string
    /** Bay the job was booked into, when it was created from the work board. */
    workBayId?: string
  }
) {
  const [settings, org, currentUser, timeZone] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId,
        key: {
          in: [
            'workshop.invoicePrefix',
            'workshop.invoiceStartNumber',
            'workshop.defaultTechnician',
            'workshop.defaultTechnicianId',
            SETTING_KEYS.WORK_ORDER_TITLE_TEMPLATE,
            ...WORKSHOP_TAX_SETTING_KEYS,
            'workboard.workDayStart',
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    workshopTimeZone(organizationId),
  ])
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const shopName = org?.name || undefined
  let techName = currentUser?.name || undefined

  // Resolve technician: explicit param > default setting by ID > legacy default by name
  let resolvedTechId = opts.technicianId
  if (resolvedTechId) {
    // Named by the caller, so it has to be one of this workshop's. Before
    // this, a lookup that found nothing still wrote the id, and the row
    // then pointed at another workshop's technician: their board showed the
    // job, and renaming their technician rewrote its name.
    const own = await db.technician.findFirst({
      where: { id: resolvedTechId, organizationId },
      select: { id: true },
    })
    if (!own) throw new Error('Technician not found')
  }
  if (opts.workBayId) {
    const bay = await db.workBay.findFirst({
      where: { id: opts.workBayId, organizationId },
      select: { id: true },
    })
    if (!bay) throw new Error('Work bay not found')
  }
  if (!resolvedTechId) {
    const defaultId = settingsMap['workshop.defaultTechnicianId']
    if (defaultId) {
      const defaultTech = await db.technician.findFirst({
        where: { id: defaultId, organizationId, isActive: true },
        select: { id: true, name: true },
      })
      if (defaultTech) {
        resolvedTechId = defaultTech.id
        techName = defaultTech.name
      }
    }
    // Legacy fallback: look up by name
    if (!resolvedTechId && settingsMap['workshop.defaultTechnician']) {
      const defaultTech = await db.technician.findFirst({
        where: { organizationId, name: settingsMap['workshop.defaultTechnician'], isActive: true },
        select: { id: true, name: true },
      })
      if (defaultTech) {
        resolvedTechId = defaultTech.id
        techName = defaultTech.name
      }
    }
  }

  // If a technician is resolved (explicit or default), use their name
  if (resolvedTechId) {
    const tech = await db.technician.findFirst({
      where: { id: resolvedTechId, organizationId },
      select: { name: true },
    })
    if (tech) techName = tech.name
  }

  const rawPrefix = settingsMap['workshop.invoicePrefix'] ?? '{year}-'
  const now = new Date()
  const today = zonedParts(now, timeZone)
  const prefix = rawPrefix
    .replace('{year}', String(today.year))
    .replace('{month}', String(today.month).padStart(2, '0'))

  const startNumber = parseInt(settingsMap['workshop.invoiceStartNumber'] || '0', 10)
  const lastRecord = await db.serviceRecord.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  })
  let nextNum = startNumber || 1001
  if (lastRecord?.invoiceNumber) {
    const match = lastRecord.invoiceNumber.match(/(\d+)$/)
    if (match) {
      const lastNum = parseInt(match[1], 10) + 1
      nextNum = Math.max(nextNum, lastNum)
    }
  }
  const invoiceNumber = `${prefix}${nextNum}`

  if (startNumber && nextNum === startNumber) {
    await db.appSetting.updateMany({
      where: { organizationId, key: 'workshop.invoiceStartNumber' },
      data: { value: '' },
    })
  }

  // The workshop's default tax, components included when it splits its tax.
  // Tax-exempt customers always get a 0% rate regardless of org default.
  const taxFields = taxFieldsForNewDocument(readWorkshopTax(settingsMap), {
    customerExempt: opts.customerExempt,
  })

  /**
   * When a job with no stated time gets booked in.
   *
   * The first slot the shop can actually take it, rather than this morning at
   * opening time: that hour is usually already gone by the time anybody books
   * anything, and it was handed out again to every job created that day, so
   * a busy Tuesday quietly stacked its whole intake on one moment. Respects
   * whoever or whatever the job is assigned to, so booking against a
   * technician does not land on top of their morning.
   */
  let defaultStart: Date
  let defaultEnd = opts.endDateTime
  // A parts sale over the counter holds no bay and no technician, so there is
  // no slot to find and nothing to search past. Only work on a vehicle is
  // scheduled around what the shop already has booked.
  const isShopWork = !!opts.vehicleId
  if (opts.startDateTime || !isShopWork) {
    defaultStart =
      opts.startDateTime ??
      atZonedTime(now, settingsMap['workboard.workDayStart'] || '07:00', timeZone)
  } else {
    const { bookings, hours } = await loadBookingContext(organizationId, now)
    const slot = nextAvailableSlot({
      from: now,
      durationMinutes: DEFAULT_JOB_MINUTES,
      bookings,
      hours,
      technicianId: opts.technicianId,
      workBayId: opts.workBayId,
    })
    if (slot) {
      defaultStart = slot.start
      if (!defaultEnd) defaultEnd = slot.end
    } else {
      // Booked solid for weeks. Falling back to opening time keeps the job on
      // the board rather than refusing to create it over a scheduling detail.
      defaultStart = atZonedTime(now, hours.start || '07:00', timeZone)
    }
  }
  // serviceDate should be date-only (start of the workshop's day)
  const serviceDate = startOfZonedDay(defaultStart, timeZone)

  // Named from the template once everything it can mention is known: the
  // number just allocated, the car, its owner, the technician and the day.
  const title =
    opts.title ??
    resolveWorkOrderTitle(
      workOrderTitleTemplateFrom(settingsMap, SETTING_KEYS.WORK_ORDER_TITLE_TEMPLATE),
      workOrderTitleValues({
        orderNumber: invoiceNumber,
        ...(await titleSubject(organizationId, opts.vehicleId, opts.customerId)),
        technicianName: techName,
        date: `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
      })
    )

  return db.serviceRecord.create({
    data: {
      organizationId,
      title,
      type: 'maintenance',
      status: 'pending',
      vehicleId: opts.vehicleId,
      customerId: opts.customerId,
      shopName,
      techName,
      technicianId: resolvedTechId || undefined,
      workBayId: opts.workBayId || undefined,
      invoiceNumber,
      ...taxFields,
      serviceDate,
      invoiceDate: serviceDate,
      startDateTime: defaultStart,
      endDateTime: defaultEnd ?? new Date(defaultStart.getTime() + 3600000),
    },
  })
}

/** The car and the customer a job is for, as far as the title template cares. */
async function titleSubject(
  organizationId: string,
  vehicleId: string | null,
  customerId: string | null
): Promise<{
  vehicle: {
    licensePlate: string | null
    make: string
    model: string
    year: number
    vin: string | null
  } | null
  customerName: string | null
}> {
  if (vehicleId) {
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        licensePlate: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        customer: { select: { name: true } },
      },
    })
    return { vehicle, customerName: vehicle?.customer?.name ?? null }
  }
  if (customerId) {
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { name: true },
    })
    return { vehicle: null, customerName: customer?.name ?? null }
  }
  return { vehicle: null, customerName: null }
}
