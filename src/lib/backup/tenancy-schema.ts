// Generated from prisma/schema by scripts/generate-tenancy-schema.ts. Do not edit.
import type { SchemaGraph } from './schema-graph'

/**
 * Which models carry an organisation, which columns are foreign keys and how
 * a child model reaches its workshop. What the restore's tenancy guard reads.
 */
export const TENANCY_SCHEMA: SchemaGraph = {
  AiGeneratedMessage: {
    organizationId: false,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
    },
    ownerPaths: [['vehicle']],
  },
  AiChat: {
    organizationId: true,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: false,
        relation: 'vehicle',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
    },
    ownerPaths: [],
  },
  AiChatMessage: {
    organizationId: false,
    foreignKeys: {
      chatId: {
        target: 'AiChat',
        required: true,
        relation: 'chat',
      },
    },
    ownerPaths: [['chat']],
  },
  AuditLog: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: false,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  User: {
    organizationId: false,
    foreignKeys: {},
    ownerPaths: [],
  },
  Session: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  Account: {
    organizationId: false,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  Verification: {
    organizationId: false,
    foreignKeys: {},
    ownerPaths: [],
  },
  TwoFactor: {
    organizationId: false,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  Passkey: {
    organizationId: false,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  UserDevice: {
    organizationId: false,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  SubscriptionPlan: {
    organizationId: false,
    foreignKeys: {},
    ownerPaths: [],
  },
  Subscription: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      planId: {
        target: 'SubscriptionPlan',
        required: true,
        relation: 'plan',
      },
    },
    ownerPaths: [],
  },
  ConditionMark: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
      inspectionId: {
        target: 'Inspection',
        required: false,
        relation: 'inspection',
      },
      inspectionItemId: {
        target: 'InspectionItem',
        required: false,
        relation: 'inspectionItem',
      },
      serviceRecordId: {
        target: 'ServiceRecord',
        required: false,
        relation: 'serviceRecord',
      },
      recordedById: {
        target: 'User',
        required: false,
        relation: 'recordedBy',
      },
      resolvedById: {
        target: 'User',
        required: false,
        relation: 'resolvedBy',
      },
    },
    ownerPaths: [],
  },
  ConditionMarkType: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  CustomFieldDefinition: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  CustomFieldValue: {
    organizationId: false,
    foreignKeys: {
      fieldId: {
        target: 'CustomFieldDefinition',
        required: true,
        relation: 'field',
      },
    },
    ownerPaths: [['field']],
  },
  Customer: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
      invoiceDesignId: {
        target: 'DocumentDesign',
        required: false,
        relation: 'invoiceDesign',
      },
      importBatchId: {
        target: 'ImportBatch',
        required: false,
        relation: 'importBatch',
      },
    },
    ownerPaths: [],
  },
  CustomerSession: {
    organizationId: true,
    foreignKeys: {
      customerId: {
        target: 'Customer',
        required: true,
        relation: 'customer',
      },
    },
    ownerPaths: [],
  },
  CustomerMagicLink: {
    organizationId: true,
    foreignKeys: {},
    ownerPaths: [],
  },
  CustomerSmsCode: {
    organizationId: true,
    foreignKeys: {},
    ownerPaths: [],
  },
  ServiceRequest: {
    organizationId: true,
    foreignKeys: {
      customerId: {
        target: 'Customer',
        required: true,
        relation: 'customer',
      },
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
    },
    ownerPaths: [],
  },
  DocumentDesign: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  DocumentDesignSnapshot: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  DocumentAssetSnapshot: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  EmailTemplate: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  ImportBatch: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  InspectionTemplate: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  InspectionTemplateSection: {
    organizationId: false,
    foreignKeys: {
      templateId: {
        target: 'InspectionTemplate',
        required: true,
        relation: 'template',
      },
    },
    ownerPaths: [['template']],
  },
  InspectionTemplateItem: {
    organizationId: false,
    foreignKeys: {
      sectionId: {
        target: 'InspectionTemplateSection',
        required: true,
        relation: 'section',
      },
    },
    ownerPaths: [['section', 'template']],
  },
  Inspection: {
    organizationId: true,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
      templateId: {
        target: 'InspectionTemplate',
        required: true,
        relation: 'template',
      },
      technicianId: {
        target: 'Technician',
        required: false,
        relation: 'technician',
      },
      workBayId: {
        target: 'WorkBay',
        required: false,
        relation: 'workBay',
      },
      designSnapshotId: {
        target: 'DocumentDesignSnapshot',
        required: false,
        relation: 'designSnapshot',
      },
      signatureSnapshotId: {
        target: 'DocumentAssetSnapshot',
        required: false,
        relation: 'signatureSnapshot',
      },
      importBatchId: {
        target: 'ImportBatch',
        required: false,
        relation: 'importBatch',
      },
    },
    ownerPaths: [],
  },
  InspectionAttachment: {
    organizationId: false,
    foreignKeys: {
      inspectionId: {
        target: 'Inspection',
        required: true,
        relation: 'inspection',
      },
    },
    ownerPaths: [['inspection']],
  },
  InspectionItem: {
    organizationId: false,
    foreignKeys: {
      inspectionId: {
        target: 'Inspection',
        required: true,
        relation: 'inspection',
      },
    },
    ownerPaths: [['inspection']],
  },
  InspectionQuoteRequest: {
    organizationId: true,
    foreignKeys: {
      inspectionId: {
        target: 'Inspection',
        required: true,
        relation: 'inspection',
      },
    },
    ownerPaths: [],
  },
  IntegrationConnection: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  IntegrationLink: {
    organizationId: false,
    foreignKeys: {
      connectionId: {
        target: 'IntegrationConnection',
        required: true,
        relation: 'connection',
      },
    },
    ownerPaths: [['connection']],
  },
  IntegrationJob: {
    organizationId: true,
    foreignKeys: {
      connectionId: {
        target: 'IntegrationConnection',
        required: true,
        relation: 'connection',
      },
    },
    ownerPaths: [],
  },
  IntegrationLog: {
    organizationId: false,
    foreignKeys: {
      connectionId: {
        target: 'IntegrationConnection',
        required: true,
        relation: 'connection',
      },
    },
    ownerPaths: [['connection']],
  },
  ExternalCalendarEvent: {
    organizationId: true,
    foreignKeys: {
      connectionId: {
        target: 'IntegrationConnection',
        required: true,
        relation: 'connection',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  VehicleSafetyReport: {
    organizationId: false,
    foreignKeys: {},
    ownerPaths: [],
  },
  BackupRun: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      connectionId: {
        target: 'IntegrationConnection',
        required: true,
        relation: 'connection',
      },
    },
    ownerPaths: [],
  },
  LaborPreset: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  LaborPresetItem: {
    organizationId: false,
    foreignKeys: {
      presetId: {
        target: 'LaborPreset',
        required: true,
        relation: 'preset',
      },
    },
    ownerPaths: [['preset']],
  },
  LaborPresetPart: {
    organizationId: false,
    foreignKeys: {
      presetId: {
        target: 'LaborPreset',
        required: true,
        relation: 'preset',
      },
    },
    ownerPaths: [['preset']],
  },
  InventoryPart: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  StockMovement: {
    organizationId: true,
    foreignKeys: {
      inventoryPartId: {
        target: 'InventoryPart',
        required: true,
        relation: 'inventoryPart',
      },
      serviceRecordId: {
        target: 'ServiceRecord',
        required: false,
        relation: 'serviceRecord',
      },
      userId: {
        target: 'User',
        required: false,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  StoredImage: {
    organizationId: false,
    foreignKeys: {
      inventoryPartId: {
        target: 'InventoryPart',
        required: false,
        relation: 'inventoryPart',
      },
      tireMeasurementId: {
        target: 'TireMeasurement',
        required: false,
        relation: 'tireMeasurement',
      },
    },
    ownerPaths: [
      ['inventoryPart'],
      ['tireMeasurement', 'tireSet'],
      ['tireMeasurement', 'movement'],
    ],
  },
  Notification: {
    organizationId: true,
    foreignKeys: {},
    ownerPaths: [],
  },
  SmsMessage: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
    },
    ownerPaths: [],
  },
  TelegramMessage: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
    },
    ownerPaths: [],
  },
  WhatsappMessage: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
    },
    ownerPaths: [],
  },
  ScheduledMessage: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
      vehicleId: {
        target: 'Vehicle',
        required: false,
        relation: 'vehicle',
      },
    },
    ownerPaths: [],
  },
  EmailMessage: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
    },
    ownerPaths: [],
  },
  EmailAttachment: {
    organizationId: false,
    foreignKeys: {
      messageId: {
        target: 'EmailMessage',
        required: true,
        relation: 'message',
      },
    },
    ownerPaths: [['message']],
  },
  AppSetting: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  DashboardWidget: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  Organization: {
    organizationId: false,
    foreignKeys: {},
    ownerPaths: [],
  },
  OrganizationMember: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      roleId: {
        target: 'Role',
        required: false,
        relation: 'customRole',
      },
    },
    ownerPaths: [],
  },
  MemberSignature: {
    organizationId: false,
    foreignKeys: {
      memberId: {
        target: 'OrganizationMember',
        required: true,
        relation: 'member',
      },
    },
    ownerPaths: [['member']],
  },
  Role: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  Permission: {
    organizationId: false,
    foreignKeys: {
      roleId: {
        target: 'Role',
        required: true,
        relation: 'role',
      },
    },
    ownerPaths: [['role']],
  },
  SystemSetting: {
    organizationId: false,
    foreignKeys: {},
    ownerPaths: [],
  },
  TeamInvitation: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      roleId: {
        target: 'Role',
        required: false,
        relation: 'customRole',
      },
    },
    ownerPaths: [],
  },
  PlatformMailUsage: {
    organizationId: true,
    foreignKeys: {},
    ownerPaths: [],
  },
  Quote: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
      tireSetId: {
        target: 'TireSet',
        required: false,
        relation: 'tireSet',
      },
      vehicleId: {
        target: 'Vehicle',
        required: false,
        relation: 'vehicle',
      },
      inspectionId: {
        target: 'Inspection',
        required: false,
        relation: 'inspection',
      },
    },
    ownerPaths: [],
  },
  QuoteAttachment: {
    organizationId: false,
    foreignKeys: {
      quoteId: {
        target: 'Quote',
        required: true,
        relation: 'quote',
      },
    },
    ownerPaths: [['quote']],
  },
  QuotePart: {
    organizationId: false,
    foreignKeys: {
      quoteId: {
        target: 'Quote',
        required: true,
        relation: 'quote',
      },
    },
    ownerPaths: [['quote']],
  },
  QuoteLabor: {
    organizationId: false,
    foreignKeys: {
      quoteId: {
        target: 'Quote',
        required: true,
        relation: 'quote',
      },
    },
    ownerPaths: [['quote']],
  },
  StatusReport: {
    organizationId: true,
    foreignKeys: {
      serviceRecordId: {
        target: 'ServiceRecord',
        required: false,
        relation: 'serviceRecord',
      },
      inspectionId: {
        target: 'Inspection',
        required: false,
        relation: 'inspection',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      technicianId: {
        target: 'Technician',
        required: false,
        relation: 'technician',
      },
    },
    ownerPaths: [],
  },
  ReportSchedule: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  ServiceRecord: {
    organizationId: true,
    foreignKeys: {
      createdById: {
        target: 'User',
        required: false,
        relation: 'createdBy',
      },
      designId: {
        target: 'DocumentDesign',
        required: false,
        relation: 'design',
      },
      issuedDesignSnapshotId: {
        target: 'DocumentDesignSnapshot',
        required: false,
        relation: 'issuedDesignSnapshot',
      },
      issuedLogoSnapshotId: {
        target: 'DocumentAssetSnapshot',
        required: false,
        relation: 'issuedLogoSnapshot',
      },
      issuedSignatureSnapshotId: {
        target: 'DocumentAssetSnapshot',
        required: false,
        relation: 'issuedSignatureSnapshot',
      },
      tireSetId: {
        target: 'TireSet',
        required: false,
        relation: 'tireSet',
      },
      customStatusId: {
        target: 'WorkOrderStatus',
        required: false,
        relation: 'customStatus',
      },
      vehicleId: {
        target: 'Vehicle',
        required: false,
        relation: 'vehicle',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
      inspectionId: {
        target: 'Inspection',
        required: false,
        relation: 'inspection',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
      technicianId: {
        target: 'Technician',
        required: false,
        relation: 'technician',
      },
      workBayId: {
        target: 'WorkBay',
        required: false,
        relation: 'workBay',
      },
      importBatchId: {
        target: 'ImportBatch',
        required: false,
        relation: 'importBatch',
      },
    },
    ownerPaths: [],
  },
  ServiceConcern: {
    organizationId: false,
    foreignKeys: {
      confirmedById: {
        target: 'User',
        required: false,
        relation: 'confirmedBy',
      },
      serviceRecordId: {
        target: 'ServiceRecord',
        required: true,
        relation: 'serviceRecord',
      },
    },
    ownerPaths: [['serviceRecord']],
  },
  Payment: {
    organizationId: false,
    foreignKeys: {
      serviceRecordId: {
        target: 'ServiceRecord',
        required: true,
        relation: 'serviceRecord',
      },
    },
    ownerPaths: [['serviceRecord']],
  },
  ServiceAttachment: {
    organizationId: false,
    foreignKeys: {
      serviceRecordId: {
        target: 'ServiceRecord',
        required: true,
        relation: 'serviceRecord',
      },
      concernId: {
        target: 'ServiceConcern',
        required: false,
        relation: 'concern',
      },
    },
    ownerPaths: [['serviceRecord'], ['concern', 'serviceRecord']],
  },
  ServicePart: {
    organizationId: false,
    foreignKeys: {
      serviceRecordId: {
        target: 'ServiceRecord',
        required: true,
        relation: 'serviceRecord',
      },
    },
    ownerPaths: [['serviceRecord']],
  },
  ServiceLabor: {
    organizationId: false,
    foreignKeys: {
      serviceRecordId: {
        target: 'ServiceRecord',
        required: true,
        relation: 'serviceRecord',
      },
    },
    ownerPaths: [['serviceRecord']],
  },
  RecurringInvoice: {
    organizationId: false,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
    },
    ownerPaths: [['vehicle']],
  },
  RecurringPart: {
    organizationId: false,
    foreignKeys: {
      recurringInvoiceId: {
        target: 'RecurringInvoice',
        required: true,
        relation: 'recurringInvoice',
      },
    },
    ownerPaths: [['recurringInvoice', 'vehicle']],
  },
  RecurringLabor: {
    organizationId: false,
    foreignKeys: {
      recurringInvoiceId: {
        target: 'RecurringInvoice',
        required: true,
        relation: 'recurringInvoice',
      },
    },
    ownerPaths: [['recurringInvoice', 'vehicle']],
  },
  WorkOrderStatus: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  Technician: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: false,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  TimeEntry: {
    organizationId: true,
    foreignKeys: {
      technicianId: {
        target: 'Technician',
        required: true,
        relation: 'technician',
      },
      serviceRecordId: {
        target: 'ServiceRecord',
        required: true,
        relation: 'serviceRecord',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  TechnicianLoginCode: {
    organizationId: true,
    foreignKeys: {
      technicianId: {
        target: 'Technician',
        required: true,
        relation: 'technician',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  TechnicianSetupCode: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  PushDevice: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  WorkBay: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  TireWarehouse: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  TireLocation: {
    organizationId: true,
    foreignKeys: {
      warehouseId: {
        target: 'TireWarehouse',
        required: true,
        relation: 'warehouse',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  TireSet: {
    organizationId: true,
    foreignKeys: {
      locationId: {
        target: 'TireLocation',
        required: false,
        relation: 'location',
      },
      vehicleId: {
        target: 'Vehicle',
        required: false,
        relation: 'vehicle',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
    },
    ownerPaths: [],
  },
  TireSetAttachment: {
    organizationId: true,
    foreignKeys: {
      tireSetId: {
        target: 'TireSet',
        required: true,
        relation: 'tireSet',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      uploadedById: {
        target: 'User',
        required: false,
        relation: 'uploadedBy',
      },
    },
    ownerPaths: [],
  },
  TireMeasurement: {
    organizationId: false,
    foreignKeys: {
      tireSetId: {
        target: 'TireSet',
        required: true,
        relation: 'tireSet',
      },
      movementId: {
        target: 'TireMovement',
        required: false,
        relation: 'movement',
      },
      measuredById: {
        target: 'User',
        required: false,
        relation: 'measuredBy',
      },
    },
    ownerPaths: [['tireSet'], ['movement']],
  },
  TireMovement: {
    organizationId: true,
    foreignKeys: {
      fromLocationId: {
        target: 'TireLocation',
        required: false,
        relation: 'fromLocation',
      },
      toLocationId: {
        target: 'TireLocation',
        required: false,
        relation: 'toLocation',
      },
      tireSetId: {
        target: 'TireSet',
        required: true,
        relation: 'tireSet',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      performedById: {
        target: 'User',
        required: false,
        relation: 'performedBy',
      },
    },
    ownerPaths: [],
  },
  TireTreatment: {
    organizationId: true,
    foreignKeys: {
      tireSetId: {
        target: 'TireSet',
        required: true,
        relation: 'tireSet',
      },
      completedById: {
        target: 'User',
        required: false,
        relation: 'completedBy',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  Vehicle: {
    organizationId: true,
    foreignKeys: {
      userId: {
        target: 'User',
        required: true,
        relation: 'user',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
      importBatchId: {
        target: 'ImportBatch',
        required: false,
        relation: 'importBatch',
      },
    },
    ownerPaths: [],
  },
  Note: {
    organizationId: false,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
    },
    ownerPaths: [['vehicle']],
  },
  FuelLog: {
    organizationId: false,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
    },
    ownerPaths: [['vehicle']],
  },
  Reminder: {
    organizationId: true,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: false,
        relation: 'vehicle',
      },
      customerId: {
        target: 'Customer',
        required: false,
        relation: 'customer',
      },
      organizationId: {
        target: 'Organization',
        required: false,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  VehicleFinding: {
    organizationId: false,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
      serviceRecordId: {
        target: 'ServiceRecord',
        required: false,
        relation: 'serviceRecord',
      },
      resolvedServiceRecordId: {
        target: 'ServiceRecord',
        required: false,
        relation: 'resolvedServiceRecord',
      },
      concernId: {
        target: 'ServiceConcern',
        required: false,
        relation: 'concern',
      },
    },
    ownerPaths: [
      ['vehicle'],
      ['serviceRecord'],
      ['resolvedServiceRecord'],
      ['concern', 'serviceRecord'],
    ],
  },
  VehicleInspectionStatus: {
    organizationId: true,
    foreignKeys: {
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  InspectionReminderCampaign: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  InspectionReminderSend: {
    organizationId: true,
    foreignKeys: {
      campaignId: {
        target: 'InspectionReminderCampaign',
        required: true,
        relation: 'campaign',
      },
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
      vehicleId: {
        target: 'Vehicle',
        required: true,
        relation: 'vehicle',
      },
      customerId: {
        target: 'Customer',
        required: true,
        relation: 'customer',
      },
      scheduledMessageId: {
        target: 'ScheduledMessage',
        required: false,
        relation: 'scheduledMessage',
      },
    },
    ownerPaths: [],
  },
  Webhook: {
    organizationId: true,
    foreignKeys: {
      organizationId: {
        target: 'Organization',
        required: true,
        relation: 'organization',
      },
    },
    ownerPaths: [],
  },
  WebhookDelivery: {
    organizationId: false,
    foreignKeys: {
      webhookId: {
        target: 'Webhook',
        required: true,
        relation: 'webhook',
      },
    },
    ownerPaths: [['webhook']],
  },
}
