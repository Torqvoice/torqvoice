export interface TemplateConfig {
  primaryColor?: string
  fontFamily?: string
  showLogo?: boolean
  showCompanyName?: boolean
  headerStyle?: string
}

export interface InvoiceData {
  id: string
  title: string
  description: string | null
  type: string
  serviceDate: Date
  shopName: string | null
  techName: string | null
  mileage: number | null
  diagnosticNotes: string | null
  invoiceNotes: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  cost: number
  invoiceNumber: string | null
  discountType?: string | null
  discountValue?: number
  discountAmount?: number
  partItems: {
    partNumber: string | null
    name: string
    quantity: number
    unitPrice: number
    total: number
  }[]
  laborItems: {
    description: string
    hours: number
    rate: number
    total: number
  }[]
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
    mileage: number
    customer: {
      name: string
      email: string | null
      phone: string | null
      address: string | null
      company: string | null
    } | null
  }
}

export interface WorkshopInfo {
  name: string
  address: string
  phone: string
  email: string
}

export interface InvoiceSettingsProps {
  bankAccount?: string
  orgNumber?: string
  paymentTerms?: string
  footerNote?: string
  showBankAccount?: boolean
  showOrgNumber?: boolean
  dueDays?: number
  currencyCode?: string
  unitSystem?: string
  dateFormat?: string
  timezone?: string
}

export interface PaymentSummary {
  totalPaid: number
  payments: { amount: number; date: string; method: string }[]
}

export interface ImageAttachment {
  fileName: string
  dataUri: string
  description?: string
}

export interface OtherAttachment {
  fileName: string
  fileType: string
}
