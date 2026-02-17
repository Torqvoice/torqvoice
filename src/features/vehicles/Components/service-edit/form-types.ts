import type {
  ServicePartInput,
  ServiceLaborInput,
  ServiceAttachmentInput,
} from '@/features/vehicles/Schema/serviceSchema'

export interface InventoryPartOption {
  id: string
  partNumber: string | null
  name: string
  unitCost: number
  quantity: number
  category: string | null
}

export interface InitialData {
  id: string
  title: string
  description: string
  type: string
  status: string
  mileage: number | null
  serviceDate: string
  techName: string
  diagnosticNotes: string
  invoiceNotes: string
  invoiceNumber?: string
  partItems: ServicePartInput[]
  laborItems: ServiceLaborInput[]
  attachments: (ServiceAttachmentInput & { includeInInvoice?: boolean })[]
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  discountType?: string
  discountValue?: number
  discountAmount?: number
}

export interface VehicleOption {
  id: string
  label: string
}

export interface TeamMemberOption {
  id: string
  name: string
}

export interface ServiceRecordFormProps {
  vehicleId: string
  vehicleName: string
  defaultTaxRate?: number
  taxEnabled?: boolean
  defaultLaborRate?: number
  currencyCode?: string
  initialData: InitialData
  inventoryParts?: InventoryPartOption[]
  vehicles?: VehicleOption[]
  teamMembers?: TeamMemberOption[]
  currentUserName?: string
}

export const emptyPart = (): ServicePartInput => ({
  partNumber: '',
  name: '',
  quantity: 1,
  unitPrice: 0,
  total: 0,
})

export const makeEmptyLabor = (defaultRate: number): ServiceLaborInput => ({
  description: '',
  hours: 0,
  rate: defaultRate,
  total: 0,
})
