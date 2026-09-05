/**
 * What a safety connector puts in its manifest to take part in the recall
 * and complaint sync: the capability, the opt-in setting and the daily tick.
 * Kept apart from the sync itself so a manifest, which the registry loads
 * eagerly, never pulls in the database or the registry.
 */

export const SAFETY_CAPABILITY = 'vehicle.safety'
export const SAFETY_JOB = 'safety.refresh'
/** One vehicle, right after it is added or its model changes, so its page is ready when opened. */
export const SAFETY_VEHICLE_JOB = 'safety.vehicle'
export const SAFETY_SETTING = 'refreshFleet'
/**
 * Bumped when the report shape or a mapping rule changes; a cached report
 * from an older version is refreshed on the next read rather than served.
 */
export const SAFETY_REPORT_VERSION = 2

export const SAFETY_MANIFEST = {
  capability: SAFETY_CAPABILITY,
  setting: {
    key: SAFETY_SETTING,
    type: 'boolean' as const,
    label: SAFETY_SETTING,
    help: `${SAFETY_SETTING}Help`,
    default: true,
  },
  schedule: { job: SAFETY_JOB, everyMinutes: 24 * 60 },
  subscriptions: [
    { event: 'vehicle.create', job: SAFETY_VEHICLE_JOB },
    { event: 'vehicle.update', job: SAFETY_VEHICLE_JOB },
  ],
}
