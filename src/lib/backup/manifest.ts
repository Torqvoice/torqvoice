/**
 * What a backup contains, in one place.
 *
 * The export route and the import route used to keep separate lists of
 * entities, and they drifted: the import accepted an upload category the
 * export never wrote, several tables were restored but never cleared, and ten
 * features shipped without ever reaching a backup. Both halves now read this
 * file, and a test compares it against the Prisma schema, so a new
 * organisation-scoped model fails the build until someone classifies it.
 *
 * Keys are part of the file format. Old backups carry the key they were
 * written with, so a key may be added but never renamed.
 */

export type BackupOption =
  | 'settings'
  | 'customers'
  | 'vehicles'
  | 'quotes'
  | 'inventory'
  | 'customFields'
  | 'technicians'
  | 'inspections'
  | 'auditLogs'
  | 'smsMessages'
  | 'scheduledMessages'
  | 'notifications'
  | 'tireHotel'
  | 'workshopConfig'

export interface BackupEntity {
  /** Prisma model name, spelled as in schema.prisma. */
  model: string
  /** Key under `data` in the backup file. Absent when the rows nest under a parent. */
  key?: string
  /** The export checkbox that includes it. */
  option: BackupOption
  /** Parent model, for rows carried inside another entity's tree. */
  nestedUnder?: string
  /**
   * How a restore treats existing rows.
   *
   * `replace` clears the organisation's rows first, which is what a restore
   * means for workshop records. `merge` leaves them and fills in what is
   * missing, for tables other records point at: clearing roles would strip
   * every member of the role they hold, since members are not in a backup.
   */
  restore: 'replace' | 'merge'
  /** Clearing order, lowest first. Children before the rows they point at. */
  clearOrder?: number
}

export const BACKUP_ENTITIES: readonly BackupEntity[] = [
  { model: 'AppSetting', key: 'settings', option: 'settings', restore: 'replace', clearOrder: 90 },
  { model: 'Customer', key: 'customers', option: 'customers', restore: 'replace', clearOrder: 80 },
  {
    model: 'CustomFieldDefinition',
    key: 'customFieldDefinitions',
    option: 'customFields',
    restore: 'replace',
    clearOrder: 60,
  },
  {
    model: 'InventoryPart',
    key: 'inventoryParts',
    option: 'inventory',
    restore: 'replace',
    clearOrder: 62,
  },
  { model: 'StockMovement', option: 'inventory', nestedUnder: 'InventoryPart', restore: 'replace' },
  { model: 'Vehicle', key: 'vehicles', option: 'vehicles', restore: 'replace', clearOrder: 50 },
  { model: 'ServiceRequest', option: 'vehicles', nestedUnder: 'Vehicle', restore: 'replace' },
  {
    model: 'ServiceRecord',
    key: 'counterSales',
    option: 'vehicles',
    restore: 'replace',
    clearOrder: 48,
  },
  { model: 'StatusReport', option: 'vehicles', nestedUnder: 'ServiceRecord', restore: 'replace' },
  {
    model: 'Reminder',
    key: 'orgReminders',
    option: 'vehicles',
    restore: 'replace',
    clearOrder: 52,
  },
  { model: 'Quote', key: 'quotes', option: 'quotes', restore: 'replace', clearOrder: 40 },
  {
    model: 'Technician',
    key: 'technicians',
    option: 'technicians',
    restore: 'replace',
    clearOrder: 70,
  },
  {
    model: 'InspectionTemplate',
    key: 'inspectionTemplates',
    option: 'inspections',
    restore: 'replace',
    clearOrder: 32,
  },
  {
    model: 'Inspection',
    key: 'inspections',
    option: 'inspections',
    restore: 'replace',
    clearOrder: 30,
  },
  {
    model: 'InspectionQuoteRequest',
    option: 'inspections',
    nestedUnder: 'Inspection',
    restore: 'replace',
  },
  { model: 'AuditLog', key: 'auditLogs', option: 'auditLogs', restore: 'replace', clearOrder: 20 },
  {
    model: 'SmsMessage',
    key: 'smsMessages',
    option: 'smsMessages',
    restore: 'replace',
    clearOrder: 10,
  },
  {
    model: 'WhatsappMessage',
    key: 'whatsappMessages',
    option: 'smsMessages',
    restore: 'replace',
    clearOrder: 11,
  },
  {
    model: 'TelegramMessage',
    key: 'telegramMessages',
    option: 'smsMessages',
    restore: 'replace',
    clearOrder: 12,
  },
  {
    model: 'ScheduledMessage',
    key: 'scheduledMessages',
    option: 'scheduledMessages',
    restore: 'replace',
    clearOrder: 13,
  },
  {
    model: 'Notification',
    key: 'notifications',
    option: 'notifications',
    restore: 'replace',
    clearOrder: 5,
  },
  {
    model: 'TireWarehouse',
    key: 'tireWarehouses',
    option: 'tireHotel',
    restore: 'replace',
    clearOrder: 46,
  },
  { model: 'TireLocation', option: 'tireHotel', nestedUnder: 'TireWarehouse', restore: 'replace' },
  { model: 'TireSet', key: 'tireSets', option: 'tireHotel', restore: 'replace', clearOrder: 44 },
  { model: 'TireMovement', option: 'tireHotel', nestedUnder: 'TireSet', restore: 'replace' },
  { model: 'TireTreatment', option: 'tireHotel', nestedUnder: 'TireSet', restore: 'replace' },
  { model: 'TireSetAttachment', option: 'tireHotel', nestedUnder: 'TireSet', restore: 'replace' },
  {
    model: 'LaborPreset',
    key: 'laborPresets',
    option: 'workshopConfig',
    restore: 'replace',
    clearOrder: 85,
  },
  {
    model: 'Webhook',
    key: 'webhooks',
    option: 'workshopConfig',
    restore: 'replace',
    clearOrder: 86,
  },
  {
    model: 'ReportSchedule',
    key: 'reportSchedules',
    option: 'workshopConfig',
    restore: 'replace',
    clearOrder: 87,
  },
  // Members keep pointing at their role, so a restore fills gaps rather than
  // clearing the table.
  { model: 'Role', key: 'roles', option: 'workshopConfig', restore: 'merge' },
]

/**
 * Organisation-scoped models a backup deliberately leaves out, and why.
 *
 * A reason is required: it is the difference between a decision and an
 * oversight, and the next person reading this needs to tell them apart.
 */
export const EXCLUDED_MODELS: Readonly<Record<string, string>> = {
  AiChat: 'Assistant conversation history, not a workshop record.',
  CustomerMagicLink: 'Single-use portal login link, expires within the hour.',
  CustomerSession: 'Portal session, recreated when the customer signs in.',
  CustomerSmsCode: 'One-time code, valid for minutes.',
  DashboardWidget: 'Per-user dashboard layout, tied to user accounts a backup does not carry.',
  OrganizationMember: 'Membership of user accounts; people are restored by inviting them.',
  Subscription: 'Billing state owned by Stripe, not by us.',
  TeamInvitation: 'Pending invitation, expires on its own.',
}

/**
 * Upload folders a backup carries. The app writes one folder per kind of
 * attachment, and a folder missing here is silently left out of every backup
 * and deleted by every restore.
 */
export const UPLOAD_CATEGORIES: readonly string[] = [
  'logos',
  'vehicles',
  'inventory',
  'services',
  'quotes',
  'tire-hotel',
  'portal',
]

/** Entities written at the top level of the backup, with their key. */
export function topLevelEntities(): (BackupEntity & { key: string })[] {
  return BACKUP_ENTITIES.filter((entity): entity is BackupEntity & { key: string } =>
    Boolean(entity.key)
  )
}

/**
 * Which tables a restore may clear, given the keys a backup actually carries.
 *
 * A selective export omits the keys it was not asked for. Clearing a table the
 * backup says nothing about would delete records the file cannot put back,
 * which is how restoring "customers only" used to wipe every vehicle.
 */
export function clearPlanFor(presentKeys: Iterable<string>): string[] {
  const keys = new Set(presentKeys)
  return topLevelEntities()
    .filter((entity) => entity.restore === 'replace' && entity.clearOrder !== undefined)
    .filter((entity) => keys.has(entity.key))
    .sort((a, b) => (a.clearOrder ?? 0) - (b.clearOrder ?? 0))
    .map((entity) => entity.model)
}
