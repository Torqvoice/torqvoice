import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * The fields Torqvoice ships ready-made, each behind its own switch on the
 * Custom Fields tab: the customer's Reference / PO and the vehicle's Fleet /
 * unit number. Off until a workshop turns them on.
 */
export const READY_MADE_FIELDS = ['customerReference', 'fleetNumber'] as const

export type ReadyMadeField = (typeof READY_MADE_FIELDS)[number]

/** The setting each switch writes. */
export const READY_MADE_FIELD_KEYS = {
  customerReference: SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED,
  fleetNumber: SETTING_KEYS.VEHICLE_FLEET_NUMBER_ENABLED,
} as const satisfies Record<ReadyMadeField, string>
