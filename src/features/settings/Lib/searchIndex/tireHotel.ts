import type { SettingsEntry } from './types'

/**
 * Tire hotel. One card; the sections inside carry ids of their own. Every
 * field below the switch only renders once the tire hotel is enabled.
 */
export const tireHotelEntries: SettingsEntry[] = [
  {
    id: 'tireHotel.storage',
    page: 'tireHotel',
    title: 'tireHotel.cardTitle',
    description: 'tireHotel.description',
    anchor: 'tire-hotel-storage',
    keywords: [
      'tire hotel',
      'tyre hotel',
      'tire storage',
      'seasonal tires',
      'dekkhotell',
      'reifenhotel',
    ],
  },
  {
    id: 'tireHotel.enabled',
    page: 'tireHotel',
    title: 'tireHotel.enable',
    description: 'tireHotel.enableHint',
    anchor: 'tireHotelEnabled',
    keywords: ['enable tire hotel', 'turn on tire storage', 'tire hotel on'],
  },
  {
    id: 'tireHotel.defaultCapacity',
    page: 'tireHotel',
    title: 'tireHotel.defaultCapacity',
    description: 'tireHotel.defaultCapacityHint',
    anchor: 'tireHotelCapacity',
    keywords: ['shelf capacity', 'tires per shelf', 'rack size', 'storage capacity'],
  },
  {
    id: 'tireHotel.warnPercent',
    page: 'tireHotel',
    title: 'tireHotel.warnPercent',
    description: 'tireHotel.warnPercentHint',
    anchor: 'tireHotelWarn',
    keywords: ['storage full warning', 'capacity warning', 'full percent', 'almost full'],
  },
  {
    id: 'tireHotel.tread',
    page: 'tireHotel',
    title: 'tireHotel.treadTitle',
    description: 'tireHotel.treadHint',
    anchor: 'tire-hotel-tread',
    keywords: [
      'tread depth',
      'summer limit',
      'winter limit',
      'minimum tread',
      'replacement threshold',
      'mønsterdybde',
    ],
  },
  {
    id: 'tireHotel.billing',
    page: 'tireHotel',
    title: 'tireHotel.billingTitle',
    description: 'tireHotel.billingHint',
    anchor: 'tire-hotel-billing',
    keywords: ['storage billing', 'storage fee', 'tire storage price'],
  },
  {
    id: 'tireHotel.seasonalPrice',
    page: 'tireHotel',
    title: 'tireHotel.seasonalPrice',
    anchor: 'tireHotelSeasonal',
    keywords: ['seasonal price', 'storage price', 'price per season', 'tire hotel price'],
  },
  {
    id: 'tireHotel.prep',
    page: 'tireHotel',
    title: 'tireHotel.prepTitle',
    description: 'tireHotel.prepHint',
    anchor: 'tire-hotel-prep',
    keywords: [
      'prep pricing',
      'wash tires',
      'wash rims',
      'balance',
      'tpms service',
      'new valves',
      'tire repair',
    ],
  },
]
