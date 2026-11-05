import type { ReactNode } from 'react'
import type { DesignAutoRule } from '@/features/invoice-designer/Lib/designRules'
import type { ServiceVideoCall } from '@/features/integrations/Actions/integrationActions'
import type { TireSetBannerData } from '@/features/tire-hotel/Components/TireSetBanner'
import type { JobClock } from '@/features/time-tracking/Actions/timeClockActions'
import type { WarrantyTexts } from '@/lib/warranty'
import type { ServiceDetail } from '../../service-detail/types'
import type { InventoryPartOption } from '../../service-edit/form-types'
import type { DesignOption } from '../../service-edit/InvoiceDetailsSection'
import type { BoardTechnicianOption, OrgMemberOption, WorkBayOption } from '../service-page-types'
import type { useServiceActions } from '../useServiceActions'
import type { useServiceFormState } from '../useServiceFormState'

/**
 * What the work order page hands its body, in two halves: the job itself
 * (concerns, lines, findings, payments, the clock) and the sidebar beside it
 * (who and what, the booking, the invoice, warranty, files). The page builds
 * each set once; ModernDetails takes both.
 */
export interface WorkOrderJobProps {
  formState: ReturnType<typeof useServiceFormState>
  actions: ReturnType<typeof useServiceActions>
  record: ServiceDetail
  /** Present only when the job came out of the tire hotel. */
  tireSet?: TireSetBannerData | null
  tireHotelEnabled?: boolean
  tireThresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
  unitSystem?: 'metric' | 'imperial'
  currencyCode: string
  defaultLaborRate: number
  inventoryParts: InventoryPartOption[]
  defaultMarkupPercent?: number
  markupAppliesToInventory?: boolean
  hasPresets?: boolean
  onOpenPresets?: () => void
  onScanBarcode?: () => void
  aiEnabled?: boolean
  vehicleId: string | null
  findings?: {
    id: string
    description: string
    severity: string
    status: string
    notes: string | null
    concernId?: string | null
    faultCode?: string | null
    faultStatus?: string | null
    faultModule?: string | null
    faultMeaning?: string | null
    faultMeaningSource?: string | null
  }[]
  onAddFinding?: () => void
  onEditFinding?: (finding: {
    id: string
    description: string
    severity: string
    status: string
    notes: string | null
  }) => void
  openObservationsCount?: number
  onShowExistingObservations?: () => void
  jobClock: JobClock
  /** A locked invoice: the notes editors go read-only, which the fieldset cannot do for them. */
  locked?: boolean
  /** The pay code button, when online payment is connected. Drawn where payments are taken. */
  payCode?: ReactNode
}

export interface WorkOrderSidebarProps {
  formState: ReturnType<typeof useServiceFormState>
  actions: ReturnType<typeof useServiceActions>
  record: ServiceDetail
  vehicleId: string | null
  organizationId: string
  currencyCode: string
  unitSystem: 'metric' | 'imperial'
  warrantyTexts: WarrantyTexts
  taxEnabled: boolean
  initialVehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  boardTechnicians: BoardTechnicianOption[]
  workBays?: WorkBayOption[]
  orgMembers?: OrgMemberOption[]
  notificationHistory?: {
    id: string
    body: string
    status: string
    createdAt: string
    toNumber: string
  }[]
  videoCall?: ServiceVideoCall
  smsEnabled?: boolean
  emailEnabled?: boolean
  telegramEnabled?: boolean
  designOptions?: DesignOption[]
  designFollowsName?: string | null
  designFollowsRule?: DesignAutoRule | null
}
