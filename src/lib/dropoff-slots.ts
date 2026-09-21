/**
 * The shots a drop-off walk asks for, in the order it asks: round the car
 * clockwise from the front, then the odometer. 'other' is for the damage
 * itself and may be used as often as needed.
 *
 * In a file of its own with nothing from Node in it, because the phone's page
 * and the work order both read it, and lib/photo-handoff.ts signs with
 * node:crypto and cannot be bundled for a browser.
 */
export const DROPOFF_SLOTS = ['front', 'right', 'rear', 'left', 'odometer', 'other'] as const
export type DropoffSlot = (typeof DROPOFF_SLOTS)[number]

export function isDropoffSlot(value: unknown): value is DropoffSlot {
  return typeof value === 'string' && (DROPOFF_SLOTS as readonly string[]).includes(value)
}
