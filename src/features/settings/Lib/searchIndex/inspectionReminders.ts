import type { SettingsEntry } from './types'

/**
 * Inspection reminders. The number fields are drawn by a helper, so each sits
 * in a wrapper with a literal id; the select and phone input have their own.
 */
export const inspectionRemindersEntries: SettingsEntry[] = [
  {
    id: 'inspectionReminders.booking',
    page: 'inspectionReminders',
    title: 'inspectionReminders.title',
    description: 'inspectionReminders.description',
    anchor: 'inspection-reminders-booking',
    keywords: [
      'inspection reminders',
      'booking link',
      'periodic inspection',
      'eu control',
      'eu-kontroll',
      'mot',
    ],
  },
  {
    id: 'inspectionReminders.duration',
    page: 'inspectionReminders',
    title: 'inspectionReminders.duration',
    description: 'inspectionReminders.durationHint',
    anchor: 'inspection-reminders-duration',
    keywords: ['inspection duration', 'slot length', 'booking length', 'minutes per inspection'],
  },
  {
    id: 'inspectionReminders.leadDays',
    page: 'inspectionReminders',
    title: 'inspectionReminders.leadDays',
    description: 'inspectionReminders.leadDaysHint',
    anchor: 'inspection-reminders-lead-days',
    keywords: ['lead time', 'earliest booking', 'days ahead', 'notice period'],
  },
  {
    id: 'inspectionReminders.horizon',
    page: 'inspectionReminders',
    title: 'inspectionReminders.horizonWeeks',
    description: 'inspectionReminders.horizonHint',
    anchor: 'inspection-reminders-horizon',
    keywords: ['booking horizon', 'weeks ahead', 'how far ahead', 'booking window'],
  },
  {
    id: 'inspectionReminders.reserve',
    page: 'inspectionReminders',
    title: 'inspectionReminders.reserve',
    description: 'inspectionReminders.reserveHint',
    anchor: 'inspection-reminders-reserve',
    keywords: ['walk-ins', 'reserve bays', 'keep capacity free', 'drop-in'],
  },
  {
    id: 'inspectionReminders.linkValid',
    page: 'inspectionReminders',
    title: 'inspectionReminders.linkValidDays',
    anchor: 'inspection-reminders-link-valid',
    keywords: ['link expiry', 'link valid', 'booking link expires', 'link lifetime'],
  },
  {
    id: 'inspectionReminders.bookingMode',
    page: 'inspectionReminders',
    title: 'inspectionReminders.bookingMode',
    description: 'inspectionReminders.bookingModeHint',
    anchor: 'ir-mode',
    keywords: [
      'booking mode',
      'direct booking',
      'booking request',
      'approve bookings',
      'online booking',
    ],
  },
  {
    id: 'inspectionReminders.phone',
    page: 'inspectionReminders',
    title: 'inspectionReminders.phone',
    description: 'inspectionReminders.phoneHint',
    anchor: 'ir-phone',
    keywords: ['phone number', 'contact phone', 'reminder phone', 'call us'],
  },
]
