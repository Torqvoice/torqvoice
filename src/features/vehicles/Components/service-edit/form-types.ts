import type {
  ServicePartInput,
  ServiceLaborInput,
  ServiceAttachmentInput,
} from '@/features/vehicles/Schema/serviceSchema'

export interface InventoryPartOption {
  id: string
  partNumber: string | null
  barcode: string | null
  name: string
  description: string | null
  unitCost: number
  sellPrice: number
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
  startDateTime?: string | null
  endDateTime?: string | null
  techName: string
  diagnosticNotes: string
  invoiceNotes: string
  invoiceNumber?: string
  invoiceDate: string
  invoiceDueDate: string
  partItems: ServicePartInput[]
  laborItems: ServiceLaborInput[]
  attachments: (ServiceAttachmentInput & { includeInInvoice?: boolean })[]
  subtotal: number
  taxRate: number
  taxAmount: number
  taxInclusive?: boolean
  totalAmount: number
  discountType?: string
  discountValue?: number
  discountAmount?: number
  warrantyMonths?: number | null
  warrantyMileage?: number | null
  warrantyNotes?: string | null
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
  unitCost: 0,
})

export const makeEmptyLabor = (defaultRate: number): ServiceLaborInput => ({
  description: '',
  hours: 0,
  rate: defaultRate,
  total: 0,
  pricingType: 'hourly',
})

export const makeEmptyService = (): ServiceLaborInput => ({
  description: '',
  hours: 1,
  rate: 0,
  total: 0,
  pricingType: 'service',
})
