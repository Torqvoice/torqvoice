import type { DesignAutoRule } from '@/features/invoice-designer/Lib/designRules'
import type { ServiceVideoCall } from '@/features/integrations/Actions/integrationActions'
import type { LockState } from '@/lib/document-lock'
import type { ServicePartInput, ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import type { ServiceDetail } from '../service-detail/types'
import type { InitialData, InventoryPartOption } from '../service-edit/form-types'
import type { LaborPresetOption } from '@/features/labor-presets/Components/LaborPresetPickerDialog'

export interface BoardTechnicianOption {
  id: string
  name: string
  userId?: string | null
}

export interface WorkBayOption {
  id: string
  name: string
}

export interface OrgMemberOption {
  id: string
  name: string | null
  email: string
}

export interface Attachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  category: string
  description: string | null
  includeInInvoice: boolean
  createdAt: Date
}

export interface ServicePageClientProps {
  record: ServiceDetail
  vehicleId: string | null
  organizationId: string
  /**
   * Whether the invoice may still be edited; see src/lib/document-lock.ts.
   * Required rather than defaulted: a call site that forgot to wire it would
   * render a locked invoice as editable, which is the trap this exists to
   * close.
   */
  lockState: LockState
  /** Owners and admins can reopen a locked invoice. */
  canUnlock: boolean
  currencyCode: string
  unitSystem: 'metric' | 'imperial'
  defaultTaxRate: number
  taxEnabled: boolean
  defaultLaborRate: number
  initialData: InitialData
  inventoryParts: InventoryPartOption[]
  initialVehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  boardTechnicians?: BoardTechnicianOption[]
  workBays?: WorkBayOption[]
  orgMembers?: OrgMemberOption[]
  currentUserName: string
  imageAttachmentsForManager: Attachment[]
  videoAttachments: Attachment[]
  documentAttachments: Attachment[]
  maxImagesPerService: number
  maxDiagnosticsPerService: number
  maxDocumentsPerService: number
  laborPresets?: LaborPresetOption[]
  smsEnabled?: boolean
  emailEnabled?: boolean
  telegramEnabled?: boolean
  aiEnabled?: boolean
  /** Gates the "Store tires" action, by plan and by the org's own switch. */
  tireHotelEnabled?: boolean
  /** The work order's video call, and the connected services that could add one. */
  videoCall?: ServiceVideoCall
  /** The workshop's tread limits, so a set checked in here grades correctly. */
  tireThresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
  defaultDueDays?: number
  defaultMarkupPercent?: number
  markupAppliesToInventory?: boolean
  statusReports?: {
    id: string
    title: string | null
    message: string | null
    status: string
    videoUrl: string | null
    createdAt: string
    publicToken: string
    expiresAt: string | null
    customerFeedback: string | null
    feedbackAt: string | null
    sentVia: string | null
    sentAt: string | null
  }[]
  initialTab?: string
  /** The workshop's saved invoice designs, for the picker on the invoice. */
  designOptions?: { id: string; name: string }[]
  /** What the invoice's "default" design resolves to, when it has a name. */
  designFollowsName?: string | null
  /** When the sheet was frozen, ISO, while it prints from that copy. */
  designPinnedAt?: string | null
  /** The rule that picked the default design, when a rule did. */
  designFollowsRule?: DesignAutoRule | null
  findings?: {
    id: string
    description: string
    severity: string
    status: string
    notes: string | null
  }[]
  openObservations?: {
    id: string
    description: string
    severity: string
    notes: string | null
    serviceRecordId: string | null
  }[]
  notificationHistory?: {
    id: string
    body: string
    status: string
    createdAt: string
    toNumber: string
  }[]
}

export type {
  ServicePartInput,
  ServiceLaborInput,
  ServiceDetail,
  InitialData,
  InventoryPartOption,
  LaborPresetOption,
}
