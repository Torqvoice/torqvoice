import { db } from '@/lib/db'
import {
  addZonedDays,
  atZonedTime,
  isZonedWeekend,
  startOfZonedDay,
  zonedParts,
} from '@/lib/timezone'
import { type ReminderCandidate, type ReminderChannel, reminderCandidates } from './candidates'
import { bookingUrl, linkExpiry, newBookingToken } from './links'
import type { InspectionReminderSettings } from './settings'
import { type TemplateValues, renderTemplate } from './template'

/**
 * Turning a reviewed list into messages.
 *
 * One row per vehicle in the send table, with the unique pair of vehicle
 * and deadline as the guarantee against a second message for the same
 * deadline; one scheduled message per row, sent once by the cron that
 * already sends everything else. A campaign is only ever created here, from
 * a person's confirmation, never from a timer.
 */

export interface CampaignDraft {
  organizationId: string
  userId: string
  idempotencyToken: string
  windowDays: number
  channel: ReminderChannel
  subject: string | null
  body: string
  vehicleIds: string[]
  appUrl: string
  locale: string
  settings: InspectionReminderSettings
}

export interface CampaignOutcome {
  campaignId: string
  created: number
  /** Vehicles in the list that could not be written to after all. */
  skipped: number
  alreadyExisted: boolean
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/**
 * Now, if the shop is open; otherwise the next opening time, on the shop's
 * own clock. A reminder confirmed at eleven at night goes out at seven the
 * next morning, in Oslo, whatever zone the server keeps.
 */
export function nextSendTime(now: Date, hours: InspectionReminderSettings['workingHours']): Date {
  const zone = hours.timeZone
  const p = zonedParts(now, zone)
  const start = minutesOf(hours.start)
  const end = minutesOf(hours.end)
  const minutes = p.hour * 60 + p.minute
  const weekendNow = isZonedWeekend(now, zone)
  if ((hours.includeWeekends || !weekendNow) && minutes >= start && minutes < end) return now
  let day = startOfZonedDay(now, zone)
  if (minutes >= end || (!hours.includeWeekends && weekendNow)) day = addZonedDays(day, 1, zone)
  for (let i = 0; i < 8; i++) {
    if (hours.includeWeekends || !isZonedWeekend(day, zone)) break
    day = addZonedDays(day, 1, zone)
  }
  return atZonedTime(day, hours.start, zone)
}

export function templateValues(input: {
  candidate: ReminderCandidate
  settings: InspectionReminderSettings
  link: string
  locale: string
}): TemplateValues {
  const { candidate, settings } = input
  return {
    customerName: candidate.customerName ?? '',
    vehicle: candidate.vehicle,
    plate: candidate.licensePlate ?? '',
    dueDate: new Intl.DateTimeFormat(input.locale, { dateStyle: 'long' }).format(
      new Date(candidate.dueAt)
    ),
    workshopName: settings.workshopName,
    bookingLink: input.link,
    phone: settings.phone ?? '',
  }
}

export async function createCampaign(draft: CampaignDraft): Promise<CampaignOutcome> {
  const existing = await db.inspectionReminderCampaign.findUnique({
    where: { idempotencyToken: draft.idempotencyToken },
    select: { id: true, recipientCount: true },
  })
  if (existing) {
    return {
      campaignId: existing.id,
      created: existing.recipientCount,
      skipped: 0,
      alreadyExisted: true,
    }
  }

  const wanted = new Set(draft.vehicleIds)
  const candidates = (
    await reminderCandidates({
      organizationId: draft.organizationId,
      windowDays: draft.windowDays,
      channel: draft.channel,
    })
  ).filter((c) => wanted.has(c.vehicleId) && !c.excluded && c.customerId && c.recipient)

  const campaign = await db.inspectionReminderCampaign.create({
    data: {
      organizationId: draft.organizationId,
      createdById: draft.userId,
      idempotencyToken: draft.idempotencyToken,
      windowDays: draft.windowDays,
      channel: draft.channel,
      subject: draft.subject,
      body: draft.body,
      status: 'sent',
    },
    select: { id: true },
  })

  const now = new Date()
  const sendAt = nextSendTime(now, draft.settings.workingHours)
  let created = 0
  let skipped = 0
  const writeOne = async (c: (typeof candidates)[number]): Promise<'created' | 'skipped'> => {
    const token = newBookingToken()
    const values = templateValues({
      candidate: c,
      settings: draft.settings,
      link: bookingUrl(draft.appUrl, token),
      locale: draft.locale,
    })
    const body = renderTemplate(draft.body, values)
    const subject = draft.subject ? renderTemplate(draft.subject, values) : null
    try {
      await db.$transaction(async (tx) => {
        // The send row goes first: its unique pair is what refuses a second
        // message for this deadline, so nothing is scheduled unless it holds.
        const send = await tx.inspectionReminderSend.create({
          data: {
            campaignId: campaign.id,
            organizationId: draft.organizationId,
            vehicleId: c.vehicleId,
            customerId: c.customerId as string,
            dueAt: new Date(c.dueAt),
            channel: draft.channel,
            recipient: c.recipient as string,
            token,
            expiresAt: linkExpiry(sendAt, new Date(c.dueAt), draft.settings.linkValidDays),
          },
          select: { id: true },
        })
        const message = await tx.scheduledMessage.create({
          data: {
            organizationId: draft.organizationId,
            createdById: draft.userId,
            channel: draft.channel,
            subject,
            body,
            recipient: c.recipient,
            customerId: c.customerId,
            vehicleId: c.vehicleId,
            sendAt,
            frequency: 'once',
            status: 'scheduled',
          },
          select: { id: true },
        })
        await tx.inspectionReminderSend.update({
          where: { id: send.id },
          data: { scheduledMessageId: message.id },
        })
      })
      return 'created'
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        return 'skipped'
      }
      throw err
    }
  }
  // A few at a time: fast for a big list, gentle on the connection pool.
  const PARALLEL = 8
  for (let i = 0; i < candidates.length; i += PARALLEL) {
    const outcomes = await Promise.all(candidates.slice(i, i + PARALLEL).map(writeOne))
    for (const o of outcomes) {
      if (o === 'created') created += 1
      else skipped += 1
    }
  }

  await db.inspectionReminderCampaign.update({
    where: { id: campaign.id },
    data: { recipientCount: created },
  })
  return { campaignId: campaign.id, created, skipped, alreadyExisted: false }
}
