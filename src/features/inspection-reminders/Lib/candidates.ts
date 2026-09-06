import { db } from '@/lib/db'

/**
 * Who a reminder campaign may write to, and who it must not, with the
 * reason for each exclusion shown to the person reviewing the list. The
 * review is the safety net, so the exclusions are as visible as the
 * inclusions.
 */

const DAY_MS = 86_400_000
/** No second message about the same vehicle to the same customer inside this window. */
export const COOLDOWN_DAYS = 60

export type ReminderChannel = 'sms' | 'whatsapp' | 'email' | 'telegram'

export type ExclusionReason =
  | 'noCustomer'
  | 'optedOut'
  | 'noRecipient'
  | 'alreadyReminded'
  | 'cooldown'
  | 'soldReported'
  | 'notRegistered'
  | 'booked'

export interface ReminderCandidate {
  vehicleId: string
  customerId: string | null
  customerName: string | null
  vehicle: string
  licensePlate: string | null
  dueAt: string
  recipient: string | null
  overdue: boolean
  excluded: ExclusionReason | null
  /** When excluded for a previous reminder: which campaign and when. */
  lastRemindedAt: string | null
}

export function recipientFor(
  channel: ReminderChannel,
  customer: { phone: string | null; email: string | null; telegramChatId: string | null } | null
): string | null {
  if (!customer) return null
  switch (channel) {
    case 'sms':
    case 'whatsapp':
      return customer.phone?.trim() || null
    case 'email':
      return customer.email?.trim() || null
    case 'telegram':
      return customer.telegramChatId?.trim() || null
  }
}

export async function reminderCandidates(input: {
  organizationId: string
  windowDays: number
  channel: ReminderChannel
  now?: Date
}): Promise<ReminderCandidate[]> {
  const now = input.now ?? new Date()
  const until = new Date(now.getTime() + input.windowDays * DAY_MS)
  const rows = await db.vehicleInspectionStatus.findMany({
    where: {
      organizationId: input.organizationId,
      dueAt: { not: null, lte: until },
      vehicle: { isArchived: false },
    },
    orderBy: { dueAt: 'asc' },
    select: {
      dueAt: true,
      registered: true,
      vehicle: {
        select: {
          id: true,
          year: true,
          make: true,
          model: true,
          licensePlate: true,
          soldReportedAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              telegramChatId: true,
              reminderOptOut: true,
            },
          },
        },
      },
    },
  })
  if (rows.length === 0) return []

  const vehicleIds = rows.map((r) => r.vehicle.id)
  const sends = await db.inspectionReminderSend.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: { in: vehicleIds },
      createdAt: { gte: new Date(now.getTime() - 400 * DAY_MS) },
    },
    select: { vehicleId: true, customerId: true, dueAt: true, createdAt: true, bookedAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const byVehicle = new Map<string, typeof sends>()
  for (const s of sends) {
    const list = byVehicle.get(s.vehicleId) ?? []
    list.push(s)
    byVehicle.set(s.vehicleId, list)
  }

  return rows.flatMap((r): ReminderCandidate[] => {
    if (!r.dueAt) return []
    const v = r.vehicle
    const customer = v.customer
    const previous = byVehicle.get(v.id) ?? []
    const sameDeadline = previous.find((p) => p.dueAt.getTime() === r.dueAt?.getTime())
    const recent = previous.find(
      (p) =>
        p.customerId === customer?.id &&
        now.getTime() - p.createdAt.getTime() < COOLDOWN_DAYS * DAY_MS
    )
    const recipient = recipientFor(input.channel, customer)

    let excluded: ExclusionReason | null = null
    if (!customer) excluded = 'noCustomer'
    else if (v.soldReportedAt) excluded = 'soldReported'
    else if (customer.reminderOptOut) excluded = 'optedOut'
    else if (r.registered === false) excluded = 'notRegistered'
    else if (sameDeadline?.bookedAt) excluded = 'booked'
    else if (sameDeadline) excluded = 'alreadyReminded'
    else if (recent) excluded = 'cooldown'
    else if (!recipient) excluded = 'noRecipient'

    return [
      {
        vehicleId: v.id,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        vehicle: `${v.year} ${v.make} ${v.model}`,
        licensePlate: v.licensePlate,
        dueAt: r.dueAt.toISOString(),
        recipient,
        overdue: r.dueAt.getTime() < now.getTime(),
        excluded,
        lastRemindedAt: (sameDeadline ?? recent)?.createdAt.toISOString() ?? null,
      },
    ]
  })
}
