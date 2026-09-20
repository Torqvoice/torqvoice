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
 * A job whose status changed somewhere else: the technician app marking it
 * complete, the board dragging it, the desk's own save.
 *
 * The shape is what the board's socket hook already reads, so every writer
 * has to send this one and nothing else. The technician app used to send a
 * `job_updated` of its own invention, which no listener had a case for: a
 * phone marking a job complete moved nothing on the desk's board and left the
 * work order page showing the old step until someone reloaded it.
 */
export type JobStatusChangedEvent = {
  type: 'job_status_changed'
  organizationId: string
  serviceRecordId: string
  status: string
  /** Enough of the job for the board to place it in its unassigned list. */
  serviceRecord?: {
    id: string
    title: string
    status: string
    vehicle: unknown
  }
}

export function announceJobStatusChanged(event: Omit<JobStatusChangedEvent, 'type'>): void {
  notificationBus.emit('workboard', {
    type: 'job_status_changed',
    ...event,
  } satisfies JobStatusChangedEvent)
}

/**
 * A line of work added from outside the page: today the technician app, after
 * a technician clocks off and bills the time.
 */
export function announceLaborAdded(event: Omit<JobLaborEvent, 'type'>): void {
  notificationBus.emit('workboard', { type: 'job_labor_added', ...event } satisfies JobLaborEvent)
}
