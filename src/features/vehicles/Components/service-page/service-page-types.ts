import type { ServicePartInput, ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'
import type { ServiceDetail } from '../service-detail/types'
import type { InitialData, InventoryPartOption } from '../service-edit/form-types'
import type { LaborPresetOption } from '@/features/labor-presets/Components/LaborPresetPickerDialog'

export interface BoardTechnicianOption {
  id: string
  name: string
  userId?: string | null
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
  vehicleId: string
  organizationId: string
  currencyCode: string
  unitSystem: 'metric' | 'imperial'
  defaultTaxRate: number
  taxEnabled: boolean
  defaultLaborRate: number
  initialData: InitialData
  inventoryParts: InventoryPartOption[]
  initialVehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null }
  boardTechnicians?: BoardTechnicianOption[]
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
  aiEnabled?: boolean
}

export type { ServicePartInput, ServiceLaborInput, ServiceDetail, InitialData, InventoryPartOption, LaborPresetOption }
