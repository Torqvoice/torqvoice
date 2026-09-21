/**
 * The three stages a work order moves through, and the workshop's own
 * statuses filed under them.
 *
 * The stages are fixed because everything else in the app reads them: what
 * counts as open, what the customer's portal shows, when a technician's clock
 * stops, which column a card sits in. A workshop's own statuses ("Ready for
 * pickup", "Waiting for approval") are labels under a stage. They carry a
 * colour and a follow-up and decide nothing, which is what lets a workshop
 * invent as many as it likes without any of those screens having to know.
 *
 * "Waiting for parts" is older than this and is one of the four values the
 * record's `status` stores, since the work board has a column for it and the
 * technician app sets it. It is drawn with the workshop's own statuses, under
 * "in progress", because that is what it is to the person choosing.
 */

export const STAGES = ['pending', 'in-progress', 'completed'] as const
export type Stage = (typeof STAGES)[number]

/** The stored statuses, which are the stages plus the one built-in hold. */
export const SYSTEM_STATUSES = ['pending', 'in-progress', 'waiting-parts', 'completed'] as const
export type SystemStatus = (typeof SYSTEM_STATUSES)[number]

export const WAITING_PARTS = 'waiting-parts'

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value)
}

export function isSystemStatus(value: unknown): value is SystemStatus {
  return typeof value === 'string' && (SYSTEM_STATUSES as readonly string[]).includes(value)
}

/** Which stage a stored status is drawn at. Unknown values read as not started. */
export function stageOf(status: string): Stage {
  if (status === WAITING_PARTS) return 'in-progress'
  return isStage(status) ? status : 'pending'
}

/**
 * Colours a status can have: names from the app's palette rather than hex
 * values, so a status reads correctly in the dark theme and nobody can pick
 * grey on grey.
 */
export const STATUS_COLORS = [
  'slate',
  'blue',
  'sky',
  'teal',
  'emerald',
  'amber',
  'orange',
  'rose',
  'violet',
] as const
export type StatusColor = (typeof STATUS_COLORS)[number]

/** Written out in full so Tailwind sees every class. */
export const STATUS_COLOR_CLASSES: Record<StatusColor, { chip: string; dot: string }> = {
  slate: {
    chip: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
  blue: {
    chip: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  sky: {
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  teal: {
    chip: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  emerald: {
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  amber: {
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  orange: {
    chip: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  rose: {
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  violet: {
    chip: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
}

export function statusColorClasses(color: string | null | undefined) {
  return STATUS_COLOR_CLASSES[(color as StatusColor) ?? 'slate'] ?? STATUS_COLOR_CLASSES.slate
}

/** What a screen needs to draw one of the workshop's statuses. */
export interface WorkOrderStatusOption {
  id: string
  name: string
  stage: Stage
  color: string
  notifyCustomer: boolean
  messageTemplate: string | null
}

/** The tokens a status message may use, the ones the other status texts already take. */
export const STATUS_MESSAGE_TOKENS = [
  'customer_name',
  'vehicle',
  'company_name',
  'current_user',
] as const

/**
 * What the record's status columns become when a job moves. One place, so
 * every way a job moves (the page, the list, the board, the technician's
 * phone, the form's save) clears a status that belonged to the stage it left.
 */
export function statusColumns(
  status: string,
  custom: { id: string } | null = null,
  now = new Date()
): { status: string; customStatusId: string | null; customStatusSince: Date | null } {
  return {
    status,
    customStatusId: custom?.id ?? null,
    customStatusSince: custom ? now : null,
  }
}
