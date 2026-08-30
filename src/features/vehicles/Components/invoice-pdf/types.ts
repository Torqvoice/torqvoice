import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'

export interface TemplateConfig {
  primaryColor?: string
  /** Sheet color behind the document. Unset leaves the paper white. */
  backgroundColor?: string
  /** Body and heading color. Unset leaves the near-black default. */
  textColor?: string
  /**
   * The company name on the letterhead. Unset leaves each header style its own
   * default, which is white on the styles that set the name into a colored band
   * and the primary color on the styles that set it on white.
   */
  companyTextColor?: string
  /**
   * The line where the sheet meets the frame, on header styles that have one.
   * Empty means no line.
   */
  frameBorderColor?: string
  /**
   * The frame's drop shadow onto the sheet: the stored setting value.
   * 'false' or false prints a flat edge; 'thin' and 'wide' size it.
   */
  frameShadow?: boolean | string
  /** Which edge the rail runs down. Defaults to the left. */
  frameSide?: 'left' | 'right'
  /** Rounding, in points, where the rail meets the header band. */
  frameRadius?: number
  fontFamily?: string
  showLogo?: boolean
  showCompanyName?: boolean
  headerStyle?: string
  logoSize?: number
  layoutConfig?: InvoiceLayoutConfig
}

export interface InvoiceData {
  id: string
  title: string
  description: string | null
  type: string
  serviceDate: Date
  startDateTime?: Date | null
  invoiceDate?: Date | null
  invoiceDueDate?: Date | null
  shopName: string | null
  techName: string | null
  technician?: { name: string } | null
  mileage: number | null
  diagnosticNotes: string | null
  invoiceNotes: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  taxInclusive?: boolean
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
    unit?: string | null
    unitPrice: number
    total: number
  }[]
  laborItems: {
    description: string
    hours: number
    rate: number
    total: number
    pricingType?: string
  }[]
  customFields?: Array<{ fieldId: string; label: string; value: string; fieldType: string }>
  findings?: Array<{ description: string; severity: string; notes: string | null }>
  warrantyMonths?: number | null
  warrantyMileage?: number | null
  warrantyExpiresAt?: Date | string | null
  warrantyNotes?: string | null
  customer?: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    company: string | null
    taxId?: string | null
    customerNumber?: string | null
  } | null
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
      taxId?: string | null
      customerNumber?: string | null
    } | null
  } | null
}

export interface WorkshopInfo {
  name: string
  address: string
  phone: string
  email: string
  /** One line under the name, set in Company details. */
  slogan?: string
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
  currencyFormat?: 'symbol' | 'code'
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
