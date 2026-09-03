'use server'

import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { appUrl } from '@/features/integrations/Lib/connections'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { createCampaign, templateValues } from '../Lib/campaign'
import { type ReminderCandidate, type ReminderChannel, reminderCandidates } from '../Lib/candidates'
import { loadInspectionReminderSettings } from '../Lib/settings'
import {
  PLACEHOLDER_TOKENS,
  renderTemplate,
  smsSegments,
  unknownPlaceholders,
} from '../Lib/template'

const CHANNELS = ['sms', 'whatsapp', 'email', 'telegram'] as const
const WINDOWS = [30, 60, 90] as const
/** A campaign larger than this is a mistake, not a workshop. */
const MAX_RECIPIENTS = 500

const MANAGE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES }]
const READ = [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }]

export interface ReminderPreview {
  candidates: ReminderCandidate[]
  channels: ReminderChannel[]
  template: { subject: string; body: string }
  /** The first includable candidate's message, rendered, so the reviewer sees the real thing. */
  sample: { subject: string | null; body: string; segments: number } | null
  settings: {
    phone: string | null
    bookingMode: 'direct' | 'request'
    linkValidDays: number
    durationMinutes: number
    timeZone: string
    /** True when no zone was chosen under Localization; sending is refused until one is. */
    timeZoneDetected: boolean
  }
  unknownPlaceholders: string[]
}

async function defaultTemplate(channel: ReminderChannel) {
  const t = await getTranslations('vehicles.inspectionReminders.defaults')
  return {
    subject: channel === 'email' ? t('emailSubject', PLACEHOLDER_TOKENS) : '',
    body:
      channel === 'email' ? t('emailBody', PLACEHOLDER_TOKENS) : t('smsBody', PLACEHOLDER_TOKENS),
  }
}

const previewSchema = z.object({
  windowDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  channel: z.enum(CHANNELS),
  subject: z.string().max(200).optional(),
  body: z.string().max(4000).optional(),
})

/** Everything the review page shows. Writes nothing. */
export async function previewInspectionReminders(raw: unknown) {
  return withAuth(
    async ({ organizationId }): Promise<ReminderPreview> => {
      const input = previewSchema.parse(raw)
      const [settings, available, candidates, locale] = await Promise.all([
        loadInspectionReminderSettings(organizationId),
        getAvailableChannels(organizationId),
        reminderCandidates({
          organizationId,
          windowDays: input.windowDays,
          channel: input.channel,
        }),
        getLocale(),
      ])
      const defaults = await defaultTemplate(input.channel)
      const saved =
        input.channel === 'email'
          ? {
              subject: settings.templateEmailSubject ?? defaults.subject,
              body: settings.templateEmailBody ?? defaults.body,
            }
          : { subject: '', body: settings.templateSms ?? defaults.body }
      const template = {
        subject: input.subject ?? saved.subject,
        body: input.body ?? saved.body,
      }
      const first = candidates.find((c) => !c.excluded)
      const sample = first
        ? (() => {
            const values = templateValues({
              candidate: first,
              settings,
              link: `${appUrl()}/b/example`,
              locale,
            })
            const body = renderTemplate(template.body, values)
            return {
              subject: input.channel === 'email' ? renderTemplate(template.subject, values) : null,
              body,
              segments: smsSegments(body),
            }
          })()
        : null
      return {
        candidates,
        channels: available.filter((c): c is ReminderChannel =>
          (CHANNELS as readonly string[]).includes(c)
        ),
        template,
        sample,
        settings: {
          phone: settings.phone,
          bookingMode: settings.bookingMode,
          linkValidDays: settings.linkValidDays,
          durationMinutes: settings.durationMinutes,
          timeZone: settings.timeZone,
          timeZoneDetected: settings.timeZoneDetected,
        },
        unknownPlaceholders: unknownPlaceholders(`${template.subject}\n${template.body}`),
      }
    },
    { requiredPermissions: READ }
  )
}

const createSchema = z.object({
  idempotencyToken: z.string().min(16).max(64),
  windowDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  channel: z.enum(CHANNELS),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  vehicleIds: z.array(z.string()).min(1).max(MAX_RECIPIENTS),
  /** The number the person typed to confirm. Must equal the list they saw. */
  confirmCount: z.number().int(),
})

/**
 * The one write in the flow. Refuses when the typed count does not match,
 * when the template still has unknown placeholders, or when the list is
 * larger than any workshop's, and creates one campaign per token however
 * many times the button is pressed.
 */
export async function createInspectionReminderCampaign(raw: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const input = createSchema.parse(raw)
      if (input.confirmCount !== input.vehicleIds.length) {
        throw new Error('The confirmation number does not match the list')
      }
      const bad = unknownPlaceholders(`${input.subject ?? ''}\n${input.body}`)
      if (bad.length > 0) throw new Error(`Unknown placeholders: ${bad.join(', ')}`)
      if (input.channel === 'email' && !input.subject?.trim()) {
        throw new Error('A subject is required for email')
      }
      if (!input.body.includes('{bookingLink}') && !input.body.includes('{phone}')) {
        throw new Error('The message must include the booking link or the phone number')
      }
      const [settings, available, locale] = await Promise.all([
        loadInspectionReminderSettings(organizationId),
        getAvailableChannels(organizationId),
        getLocale(),
      ])
      if (!available.includes(input.channel)) throw new Error('That channel is not set up')
      // Booking times in the link are the workshop's. A zone guessed from
      // whichever browser saved settings last is not good enough to put in
      // front of a customer.
      if (settings.timeZoneDetected) {
        throw new Error('Choose the workshop timezone under Settings → Localization before sending')
      }
      if (
        input.body.includes('{phone}') &&
        !settings.phone &&
        !input.body.includes('{bookingLink}')
      ) {
        throw new Error('Set a phone number in the inspection reminder settings first')
      }

      const outcome = await createCampaign({
        organizationId,
        userId,
        idempotencyToken: input.idempotencyToken,
        windowDays: input.windowDays,
        channel: input.channel,
        subject: input.channel === 'email' ? (input.subject?.trim() ?? null) : null,
        body: input.body,
        vehicleIds: input.vehicleIds,
        appUrl: appUrl(),
        locale,
        settings,
      })
      // Remember the wording for next time, per channel.
      await db.appSetting.upsert({
        where: {
          organizationId_key: {
            organizationId,
            key:
              input.channel === 'email'
                ? 'inspectionReminders.template.emailBody'
                : 'inspectionReminders.template.sms',
          },
        },
        create: {
          organizationId,
          userId,
          key:
            input.channel === 'email'
              ? 'inspectionReminders.template.emailBody'
              : 'inspectionReminders.template.sms',
          value: input.body,
        },
        update: { value: input.body },
      })
      if (input.channel === 'email' && input.subject) {
        await db.appSetting.upsert({
          where: {
            organizationId_key: {
              organizationId,
              key: 'inspectionReminders.template.emailSubject',
            },
          },
          create: {
            organizationId,
            userId,
            key: 'inspectionReminders.template.emailSubject',
            value: input.subject,
          },
          update: { value: input.subject },
        })
      }
      return outcome
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'inspection_reminders.send',
        entity: 'InspectionReminderCampaign',
        entityId: result.campaignId,
        details: { key: 'inspection_reminders_sent', params: { count: result.created } },
      }),
    }
  )
}

export async function listInspectionReminderCampaigns() {
  return withAuth(
    async ({ organizationId }) => {
      const rows = await db.inspectionReminderCampaign.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          windowDays: true,
          channel: true,
          recipientCount: true,
          status: true,
          sends: {
            select: { bookedAt: true, scheduledMessage: { select: { status: true } } },
          },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        windowDays: r.windowDays,
        channel: r.channel,
        status: r.status,
        recipients: r.recipientCount,
        sent: r.sends.filter((s) => s.scheduledMessage?.status === 'sent').length,
        failed: r.sends.filter((s) => s.scheduledMessage?.status === 'failed').length,
        booked: r.sends.filter((s) => s.bookedAt).length,
      }))
    },
    { requiredPermissions: READ }
  )
}

export async function getInspectionReminderCampaign(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      const c = await db.inspectionReminderCampaign.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          createdAt: true,
          windowDays: true,
          channel: true,
          subject: true,
          body: true,
          status: true,
          recipientCount: true,
          sends: {
            orderBy: { dueAt: 'asc' },
            select: {
              id: true,
              dueAt: true,
              recipient: true,
              expiresAt: true,
              bookedAt: true,
              cancelledAt: true,
              bookedServiceRecordId: true,
              vehicle: {
                select: { id: true, year: true, make: true, model: true, licensePlate: true },
              },
              customer: { select: { id: true, name: true } },
              scheduledMessage: {
                select: { id: true, status: true, sentAt: true, errorMessage: true },
              },
            },
          },
        },
      })
      if (!c) throw new Error('Campaign not found')
      return {
        ...c,
        createdAt: c.createdAt.toISOString(),
        sends: c.sends.map((s) => ({
          ...s,
          dueAt: s.dueAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          bookedAt: s.bookedAt?.toISOString() ?? null,
          cancelledAt: s.cancelledAt?.toISOString() ?? null,
          scheduledMessage: s.scheduledMessage
            ? { ...s.scheduledMessage, sentAt: s.scheduledMessage.sentAt?.toISOString() ?? null }
            : null,
        })),
      }
    },
    { requiredPermissions: READ }
  )
}

/** Put failed rows back in the queue. Sent rows are never touched. */
export async function retryFailedInspectionReminders(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const campaign = await db.inspectionReminderCampaign.findFirst({
        where: { id, organizationId },
        select: { id: true },
      })
      if (!campaign) throw new Error('Campaign not found')
      const failed = await db.scheduledMessage.findMany({
        where: { organizationId, status: 'failed', inspectionReminder: { campaignId: id } },
        select: { id: true },
      })
      if (failed.length === 0) return { retried: 0 }
      await db.scheduledMessage.updateMany({
        where: { id: { in: failed.map((f) => f.id) } },
        data: { status: 'scheduled', sendAt: new Date(), errorMessage: null },
      })
      return { retried: failed.length }
    },
    { requiredPermissions: MANAGE }
  )
}

/** One message, to the person pressing the button, with sample values. */
export async function sendTestInspectionReminder(raw: unknown) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const input = z
        .object({
          channel: z.enum(CHANNELS),
          subject: z.string().max(200).optional(),
          body: z.string().min(1).max(4000),
        })
        .parse(raw)
      const [settings, user, locale] = await Promise.all([
        loadInspectionReminderSettings(organizationId),
        db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
        getLocale(),
      ])
      const recipient = input.channel === 'email' ? (user?.email ?? null) : settings.phone
      if (!recipient) {
        throw new Error(
          input.channel === 'email'
            ? 'Your account has no email address'
            : 'Set a phone number in the inspection reminder settings to receive the test'
        )
      }
      const values = templateValues({
        candidate: {
          vehicleId: '',
          customerId: null,
          customerName: user?.name ?? 'Test',
          vehicle: '2019 Volvo V90',
          licensePlate: 'EV11223',
          dueAt: new Date(Date.now() + 45 * 86_400_000).toISOString(),
          recipient,
          overdue: false,
          excluded: null,
          lastRemindedAt: null,
        },
        settings,
        link: `${appUrl()}/b/example`,
        locale,
      })
      await db.scheduledMessage.create({
        data: {
          organizationId,
          createdById: userId,
          channel: input.channel,
          subject: input.channel === 'email' ? renderTemplate(input.subject ?? '', values) : null,
          body: renderTemplate(input.body, values),
          recipient,
          sendAt: new Date(),
          frequency: 'once',
          status: 'scheduled',
        },
      })
      return { sentTo: recipient }
    },
    { requiredPermissions: MANAGE }
  )
}
