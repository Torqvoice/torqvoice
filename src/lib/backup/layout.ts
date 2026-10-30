/**
 * The shape of a backup file: which model each dataset holds and which
 * property of a row carries its nested rows. The export (build-data.ts)
 * writes this shape and the import (import.ts) reads it; the tenancy guard
 * walks it to know, for every row in the file, which model it is bound for.
 * A test checks that every model in the manifest appears here.
 */

export interface LayoutNode {
  model: string
  children?: Record<string, LayoutNode>
}

const serviceRecordTree: Record<string, LayoutNode> = {
  concerns: { model: 'ServiceConcern' },
  partItems: { model: 'ServicePart' },
  laborItems: { model: 'ServiceLabor' },
  attachments: { model: 'ServiceAttachment' },
  payments: { model: 'Payment' },
  statusReports: { model: 'StatusReport' },
  timeEntries: { model: 'TimeEntry' },
}

export const BACKUP_LAYOUT: Record<string, LayoutNode> = {
  settings: { model: 'AppSetting' },
  documentDesigns: { model: 'DocumentDesign' },
  emailTemplates: { model: 'EmailTemplate' },
  customers: { model: 'Customer' },
  documentDesignSnapshots: { model: 'DocumentDesignSnapshot' },
  documentAssetSnapshots: { model: 'DocumentAssetSnapshot' },
  customFieldDefinitions: {
    model: 'CustomFieldDefinition',
    children: { values: { model: 'CustomFieldValue' } },
  },
  inventoryParts: {
    model: 'InventoryPart',
    children: { movements: { model: 'StockMovement' }, gallery: { model: 'StoredImage' } },
  },
  vehicles: {
    model: 'Vehicle',
    children: {
      notes: { model: 'Note' },
      fuelLogs: { model: 'FuelLog' },
      reminders: { model: 'Reminder' },
      serviceRequests: { model: 'ServiceRequest' },
      inspectionStatus: { model: 'VehicleInspectionStatus' },
      findings: { model: 'VehicleFinding' },
      conditionMarks: { model: 'ConditionMark' },
      aiMessages: { model: 'AiGeneratedMessage' },
      recurringInvoices: {
        model: 'RecurringInvoice',
        children: {
          templateParts: { model: 'RecurringPart' },
          templateLabor: { model: 'RecurringLabor' },
        },
      },
      serviceRecords: { model: 'ServiceRecord', children: serviceRecordTree },
    },
  },
  orgReminders: { model: 'Reminder' },
  counterSales: { model: 'ServiceRecord', children: serviceRecordTree },
  quotes: {
    model: 'Quote',
    children: {
      partItems: { model: 'QuotePart' },
      laborItems: { model: 'QuoteLabor' },
      attachments: { model: 'QuoteAttachment' },
    },
  },
  technicians: { model: 'Technician' },
  workBays: { model: 'WorkBay' },
  inspectionTemplates: {
    model: 'InspectionTemplate',
    children: {
      sections: {
        model: 'InspectionTemplateSection',
        children: { items: { model: 'InspectionTemplateItem' } },
      },
    },
  },
  inspections: {
    model: 'Inspection',
    children: {
      items: { model: 'InspectionItem' },
      attachments: { model: 'InspectionAttachment' },
      statusReports: { model: 'StatusReport' },
      quoteRequests: { model: 'InspectionQuoteRequest' },
    },
  },
  tireWarehouses: { model: 'TireWarehouse', children: { locations: { model: 'TireLocation' } } },
  tireSets: {
    model: 'TireSet',
    children: {
      measurements: { model: 'TireMeasurement', children: { images: { model: 'StoredImage' } } },
      movements: { model: 'TireMovement' },
      treatments: { model: 'TireTreatment' },
      attachments: { model: 'TireSetAttachment' },
    },
  },
  workOrderStatuses: { model: 'WorkOrderStatus' },
  conditionMarkTypes: { model: 'ConditionMarkType' },
  laborPresets: {
    model: 'LaborPreset',
    children: { items: { model: 'LaborPresetItem' }, parts: { model: 'LaborPresetPart' } },
  },
  webhooks: { model: 'Webhook' },
  reportSchedules: { model: 'ReportSchedule' },
  roles: { model: 'Role', children: { permissions: { model: 'Permission' } } },
  auditLogs: { model: 'AuditLog' },
  smsMessages: { model: 'SmsMessage' },
  whatsappMessages: { model: 'WhatsappMessage' },
  telegramMessages: { model: 'TelegramMessage' },
  emailMessages: { model: 'EmailMessage', children: { attachments: { model: 'EmailAttachment' } } },
  scheduledMessages: { model: 'ScheduledMessage' },
  inspectionReminderCampaigns: { model: 'InspectionReminderCampaign' },
  inspectionReminderSends: { model: 'InspectionReminderSend' },
  notifications: { model: 'Notification' },
}

export type Row = Record<string, unknown>

/** A row visitor says whether the row stays in the file. */
export type RowVisitor = (model: string, row: Row, parent: Row | null) => 'keep' | 'drop'

function rowsOf(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((v): v is Row => !!v && typeof v === 'object')
  if (value && typeof value === 'object') return [value as Row]
  return []
}

function walkNode(
  node: LayoutNode,
  holder: Row,
  key: string,
  parent: Row | null,
  visit: RowVisitor
) {
  const value = holder[key]
  const rows = rowsOf(value)
  const kept: Row[] = []
  for (const row of rows) {
    if (visit(node.model, row, parent) === 'drop') continue
    kept.push(row)
    for (const [childKey, child] of Object.entries(node.children ?? {})) {
      if (childKey in row) walkNode(child, row, childKey, row, visit)
    }
  }
  if (kept.length !== rows.length) {
    holder[key] = Array.isArray(value) ? kept : (kept[0] ?? null)
  }
}

/**
 * Visits every row the file holds, parents before children, and removes
 * the rows the visitor drops, with everything nested inside them.
 */
export function walkBackup(data: Row, visit: RowVisitor): void {
  for (const [key, node] of Object.entries(BACKUP_LAYOUT)) {
    if (key in data) walkNode(node, data, key, null, visit)
  }
}

/** Every model the layout can hold rows for. */
export function layoutModels(): Set<string> {
  const out = new Set<string>()
  const add = (node: LayoutNode) => {
    out.add(node.model)
    for (const child of Object.values(node.children ?? {})) add(child)
  }
  for (const node of Object.values(BACKUP_LAYOUT)) add(node)
  return out
}
