import { db } from '@/lib/db'

/**
 * Shared draft-record creation for both work orders (with a vehicle) and
 * counter sales (no vehicle, direct customer link). Resolves invoice number,
 * default technician, tax settings and schedule times identically.
 */
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
  }
) {
  const [settings, org, currentUser] = await Promise.all([
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
  const prefix = rawPrefix
    .replace('{year}', now.getFullYear().toString())
    .replace('{month}', String(now.getMonth() + 1).padStart(2, '0'))

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

  // Default to today's date at work day start time (from settings, fallback 07:00)
  let defaultStart: Date
  if (!opts.startDateTime) {
    const workDayStart = settingsMap['workboard.workDayStart'] || '07:00'
    const [h, m] = workDayStart.split(':').map(Number)
    defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  } else {
    defaultStart = opts.startDateTime
  }
  // serviceDate should be date-only (start of day)
  const serviceDate = new Date(
    defaultStart.getFullYear(),
    defaultStart.getMonth(),
    defaultStart.getDate()
  )

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
      invoiceNumber,
      taxRate: defaultTaxRate,
      taxInclusive,
      serviceDate,
      invoiceDate: serviceDate,
      startDateTime: defaultStart,
      endDateTime: opts.endDateTime ?? new Date(defaultStart.getTime() + 3600000),
    },
  })
}
