import { notificationBus } from '@/lib/notification-bus'

/**
 * What the web is told when a job changes from somewhere else.
 *
 * Goes out on the work board channel, beside the clock events, so a desk with
 * the work order open hears about it without reloading. Only ids travel: the
 * listener reads the job back itself, which keeps a frame that arrives late
 * from ever overwriting a fresher read.
 */
export type JobLaborEvent = {
  type: 'job_labor_added'
  organizationId: string
  serviceRecordId: string
  laborId: string
}

/**
 * A line of work added from outside the page: today the technician app, after
 * a technician clocks off and bills the time.
 */
export function announceLaborAdded(event: Omit<JobLaborEvent, 'type'>): void {
  notificationBus.emit('workboard', { type: 'job_labor_added', ...event } satisfies JobLaborEvent)
}
