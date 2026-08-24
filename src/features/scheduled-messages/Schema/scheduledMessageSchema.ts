import { z } from 'zod'

/** Where a scheduled message goes out. "in_app" notifies the workshop, not the customer. */
export const MESSAGE_CHANNELS = ['email', 'sms', 'whatsapp', 'telegram', 'in_app'] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

/** "once" sends and stops; the rest reschedule themselves after each send. */
export const MESSAGE_FREQUENCIES = [
  'once',
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
] as const
export type MessageFrequency = (typeof MESSAGE_FREQUENCIES)[number]

export const MESSAGE_STATUSES = ['scheduled', 'sent', 'failed', 'cancelled'] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const createScheduledMessageSchema = z
  .object({
    channel: z.enum(MESSAGE_CHANNELS),
    subject: z.string().max(200).optional(),
    body: z.string().min(1, 'Message is required'),
    // Typed by hand when there is no customer, or to override the one on file
    recipient: z.string().max(320).optional(),
    customerId: z.string().nullable().optional(),
    vehicleId: z.string().nullable().optional(),
    // Local wall-clock the workshop picked, e.g. "2026-08-20T09:00"
    sendAt: z.string().min(1, 'Send time is required'),
    frequency: z.enum(MESSAGE_FREQUENCIES).default('once'),
    endDate: z.string().optional(),
  })
  .refine((v) => v.channel !== 'email' || !!v.subject?.trim(), {
    message: 'Subject is required for email',
    path: ['subject'],
  })
  // A customer carries the address; without one the workshop has to say where
  // it goes. In-app notifications land in the workshop's own bell, so neither.
  .refine((v) => v.channel === 'in_app' || !!v.customerId || !!v.recipient?.trim(), {
    message: 'Pick a customer or enter a recipient',
    path: ['recipient'],
  })

export type CreateScheduledMessageInput = z.infer<typeof createScheduledMessageSchema>

export const updateScheduledMessageSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).optional(),
  recipient: z.string().max(320).optional(),
  customerId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  sendAt: z.string().optional(),
  frequency: z.enum(MESSAGE_FREQUENCIES).optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
})

export type UpdateScheduledMessageInput = z.infer<typeof updateScheduledMessageSchema>
