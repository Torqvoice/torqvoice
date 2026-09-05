/**
 * What a safety connector puts in its manifest to take part in the recall
 * and complaint sync: the capability, the opt-in setting and the daily tick.
 * Kept apart from the sync itself so a manifest, which the registry loads
 * eagerly, never pulls in the database or the registry.
 */

export const SAFETY_CAPABILITY = 'vehicle.safety'
export const SAFETY_JOB = 'safety.refresh'
export const SAFETY_SETTING = 'refreshFleet'

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
}
