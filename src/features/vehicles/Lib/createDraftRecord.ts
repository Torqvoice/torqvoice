import { db } from '@/lib/db'
import { nextAvailableSlot } from '@/features/workboard/Lib/availability'
import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { atZonedTime, startOfZonedDay, zonedParts } from '@/lib/timezone'

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
    title: string
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
            'workshop.defaultTaxRate',
            'workshop.taxEnabled',
            'workshop.taxInclusive',
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

  // Apply default tax rate from settings (if tax is enabled).
  // Tax-exempt customers always get a 0% rate regardless of org default.
  const taxEnabled = settingsMap['workshop.taxEnabled'] !== 'false'
  const defaultTaxRate =
    taxEnabled && !opts.customerExempt ? Number(settingsMap['workshop.defaultTaxRate']) || 0 : 0
  const taxInclusive = settingsMap['workshop.taxInclusive'] === 'true'

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

  return db.serviceRecord.create({
    data: {
      organizationId,
      title: opts.title,
      type: 'maintenance',
      status: 'pending',
      vehicleId: opts.vehicleId,
      customerId: opts.customerId,
      shopName,
      techName,
      technicianId: resolvedTechId || undefined,
      workBayId: opts.workBayId || undefined,
      invoiceNumber,
      taxRate: defaultTaxRate,
      taxInclusive,
      serviceDate,
      invoiceDate: serviceDate,
      startDateTime: defaultStart,
      endDateTime: defaultEnd ?? new Date(defaultStart.getTime() + 3600000),
    },
  })
}
