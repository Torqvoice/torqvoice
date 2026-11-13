import { z } from 'zod'

/** The longest an appointment can be booked for: a week of the shop's time. */
export const MAX_APPOINTMENT_MINUTES = 7 * 24 * 60

/**
 * An appointment booked from the calendar: who it is for, what they want
 * done, and when and for how long, read as the workshop's own wall clock.
 * A car, a customer or both; with only a customer the car is added to the
 * job when it arrives.
 */
export const bookAppointmentSchema = z
  .object({
    vehicleId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    /** What needs doing, one thing per line. */
    work: z.string().trim().min(1).max(4000),
    /** YYYY-MM-DD in the workshop's time zone. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** HH:MM in the workshop's time zone. */
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().min(5).max(MAX_APPOINTMENT_MINUTES),
  })
  .refine((v) => Boolean(v.vehicleId || v.customerId), {
    message: 'Choose a vehicle or a customer',
    path: ['vehicleId'],
  })

export type BookAppointmentInput = z.input<typeof bookAppointmentSchema>
